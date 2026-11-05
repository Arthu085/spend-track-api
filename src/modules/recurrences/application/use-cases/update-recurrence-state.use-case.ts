import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { financeToday } from '@shared/domain/calendar';
import { RecurrenceEntity } from '../../domain/entities/recurrence.entity';
import { RecurrenceState } from '../../domain/enums/recurrence-state.enum';
import {
  RECURRENCE_REPOSITORY,
  type RecurrenceRepository,
} from '../../domain/repositories/recurrence.repository';
import { RecurrenceOccurrenceGenerator } from '../services/recurrence-occurrence-generator';
import { RecurrenceOccurrences } from '../services/recurrence-occurrences';
import { RecurrenceReferences } from '../services/recurrence-references';

export interface UpdateRecurrenceStateInput {
  uuid: string;
  ownerId: number;
  state: RecurrenceState.ACTIVE | RecurrenceState.PAUSED;
}

@Injectable()
export class UpdateRecurrenceStateUseCase {
  constructor(
    @Inject(RECURRENCE_REPOSITORY)
    private readonly recurrenceRepository: RecurrenceRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
    private readonly references: RecurrenceReferences,
    private readonly occurrences: RecurrenceOccurrences,
    private readonly generator: RecurrenceOccurrenceGenerator,
  ) {}

  async execute(input: UpdateRecurrenceStateInput): Promise<RecurrenceEntity> {
    return this.transactionManager.runInTransaction(async () => {
      await this.references.lockOwnerFinances(input.ownerId);

      const recurrence = await this.references.lockRecurrence(
        input.uuid,
        input.ownerId,
      );

      const today = financeToday();

      if (input.state === RecurrenceState.PAUSED) {
        const paused = await this.recurrenceRepository.update(
          recurrence.pause(today),
        );

        await this.occurrences.removePlanned(paused, today);

        return paused;
      }

      const resumed = recurrence.resume(today);

      if (
        recurrence.isInvestmentContribution &&
        recurrence.investment &&
        recurrence.account
      ) {
        await this.references.activeInvestment(
          recurrence.investment.uuid,
          input.ownerId,
        );
        await this.references.activeAccount(
          recurrence.account.uuid,
          input.ownerId,
        );
      }

      return this.generator.generate(
        await this.recurrenceRepository.update(resumed),
        today,
      );
    });
  }
}
