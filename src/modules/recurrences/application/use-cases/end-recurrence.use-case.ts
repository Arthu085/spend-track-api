import { Inject, Injectable } from '@nestjs/common';
import { CreditCardInvoiceAssigner } from '@modules/credit-cards';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { addDaysToDate, financeToday } from '@shared/domain/calendar';
import { RecurrenceEntity } from '../../domain/entities/recurrence.entity';
import { RecurrenceInvoiceEndNotApplicableError } from '../../domain/errors/recurrence-invoice-end-not-applicable.error';
import {
  RECURRENCE_REPOSITORY,
  type RecurrenceRepository,
} from '../../domain/repositories/recurrence.repository';
import { RecurrenceOccurrenceGenerator } from '../services/recurrence-occurrence-generator';
import { RecurrenceOccurrences } from '../services/recurrence-occurrences';
import { RecurrenceReferences } from '../services/recurrence-references';

export interface EndRecurrenceInput {
  uuid: string;
  ownerId: number;
  from?: string;
  fromInvoiceMonth?: string;
}

@Injectable()
export class EndRecurrenceUseCase {
  constructor(
    @Inject(RECURRENCE_REPOSITORY)
    private readonly recurrenceRepository: RecurrenceRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
    private readonly references: RecurrenceReferences,
    private readonly occurrences: RecurrenceOccurrences,
    private readonly generator: RecurrenceOccurrenceGenerator,
    private readonly invoiceAssigner: CreditCardInvoiceAssigner,
  ) {}

  async execute(input: EndRecurrenceInput): Promise<RecurrenceEntity> {
    return this.transactionManager.runInTransaction(async () => {
      await this.references.lockOwnerFinances(input.ownerId);

      const recurrence = await this.references.lockRecurrence(
        input.uuid,
        input.ownerId,
      );

      const today = financeToday();

      recurrence.assertChangeable(today);

      const cut = await this.cutOf(recurrence, input);

      const ended = await this.recurrenceRepository.update(
        recurrence.endBefore(cut, today),
      );

      await this.occurrences.removePlanned(
        ended,
        cut ?? addDaysToDate(today, 1),
      );

      return this.generator.generate(ended, today);
    });
  }

  private async cutOf(
    recurrence: RecurrenceEntity,
    input: EndRecurrenceInput,
  ): Promise<string | null> {
    if (input.fromInvoiceMonth === undefined) {
      return input.from ?? null;
    }

    if (!recurrence.creditCard) {
      throw new RecurrenceInvoiceEndNotApplicableError();
    }

    return addDaysToDate(
      await this.invoiceAssigner.lastDateBefore(
        recurrence.creditCard,
        input.fromInvoiceMonth,
      ),
      1,
    );
  }
}
