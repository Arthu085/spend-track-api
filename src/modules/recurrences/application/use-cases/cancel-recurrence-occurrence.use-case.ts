import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import type { RecurrenceOccurrence } from '../services/recurrence-occurrence';
import { RecurrenceOccurrences } from '../services/recurrence-occurrences';
import { RecurrenceReferences } from '../services/recurrence-references';

export interface CancelRecurrenceOccurrenceInput {
  uuid: string;
  occurrenceUuid: string;
  ownerId: number;
}

@Injectable()
export class CancelRecurrenceOccurrenceUseCase {
  constructor(
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
    private readonly references: RecurrenceReferences,
    private readonly occurrences: RecurrenceOccurrences,
  ) {}

  async execute(
    input: CancelRecurrenceOccurrenceInput,
  ): Promise<RecurrenceOccurrence> {
    return this.transactionManager.runInTransaction(async () => {
      await this.references.lockOwnerFinances(input.ownerId);

      const recurrence = await this.references.lockRecurrence(
        input.uuid,
        input.ownerId,
      );

      return this.occurrences.cancel(
        recurrence,
        await this.occurrences.lockPlanned(recurrence, input.occurrenceUuid),
      );
    });
  }
}
