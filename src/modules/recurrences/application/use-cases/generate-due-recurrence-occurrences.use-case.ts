import { Inject, Injectable, Logger } from '@nestjs/common';
import { describeError } from '@shared/application/logging';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { financeToday } from '@shared/domain/calendar';
import {
  RECURRENCE_REPOSITORY,
  type RecurrenceKey,
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
  private readonly logger = new Logger(
    GenerateDueRecurrenceOccurrencesUseCase.name,
  );

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
      today,
      GENERATION_BATCH_SIZE,
    );

    let extended = 0;

    for (const key of due) {
      if (await this.extend(key, today)) {
        extended += 1;
      }
    }

    return extended;
  }

  private async extend(key: RecurrenceKey, today: string): Promise<boolean> {
    try {
      await this.transactionManager.runInTransaction(async () => {
        await this.references.lockOwnerFinances(key.ownerId);

        await this.generator.generate(
          await this.references.lockRecurrence(key.uuid, key.ownerId),
          today,
        );
      });

      return true;
    } catch (error) {
      this.logger.error({
        msg: 'Recurrence occurrence generation failed',
        recurrenceUuid: key.uuid,
        error: describeError(error),
      });

      return false;
    }
  }
}
