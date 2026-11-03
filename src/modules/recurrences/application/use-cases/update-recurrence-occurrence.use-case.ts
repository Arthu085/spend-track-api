import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import type { RecurrenceOccurrence } from '../services/recurrence-occurrence';
import { RecurrenceOccurrences } from '../services/recurrence-occurrences';
import { RecurrenceReferences } from '../services/recurrence-references';

export interface UpdateRecurrenceOccurrenceInput {
  uuid: string;
  occurrenceUuid: string;
  ownerId: number;
  amount?: number;
  date?: string;
}

@Injectable()
export class UpdateRecurrenceOccurrenceUseCase {
  constructor(
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
    private readonly references: RecurrenceReferences,
    private readonly occurrences: RecurrenceOccurrences,
  ) {}

  async execute(
    input: UpdateRecurrenceOccurrenceInput,
  ): Promise<RecurrenceOccurrence> {
    return this.transactionManager.runInTransaction(async () => {
      await this.references.lockOwnerFinances(input.ownerId);

      const recurrence = await this.references.lockRecurrence(
        input.uuid,
        input.ownerId,
      );

      const occurrence = await this.occurrences.lockPlanned(
        recurrence,
        input.occurrenceUuid,
      );

      return this.occurrences.reschedule(recurrence, occurrence, {
        amount: input.amount,
        date: input.date,
      });
    });
  }
}
