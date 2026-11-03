import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { financeToday } from '@shared/domain/calendar';
import {
  RECURRENCE_REPOSITORY,
  type RecurrenceRepository,
} from '../../domain/repositories/recurrence.repository';
import {
  RecurrenceOccurrenceGenerator,
  generationHorizon,
} from '../services/recurrence-occurrence-generator';
import { RecurrenceReferences } from '../services/recurrence-references';

export const GENERATION_BATCH_SIZE = 500;

@Injectable()
export class GenerateDueRecurrenceOccurrencesUseCase {
  constructor(
    @Inject(RECURRENCE_REPOSITORY)
    private readonly recurrenceRepository: RecurrenceRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
    private readonly references: RecurrenceReferences,
    private readonly generator: RecurrenceOccurrenceGenerator,
  ) {}

  async execute(today: string = financeToday()): Promise<number> {
    const due = await this.recurrenceRepository.findDueForGeneration(
      generationHorizon(today),
      GENERATION_BATCH_SIZE,
    );

    for (const key of due) {
      await this.transactionManager.runInTransaction(async () => {
        await this.references.lockOwnerFinances(key.ownerId);

        await this.generator.generate(
          await this.references.lockRecurrence(key.uuid, key.ownerId),
          today,
        );
      });
    }

    return due.length;
  }
}
