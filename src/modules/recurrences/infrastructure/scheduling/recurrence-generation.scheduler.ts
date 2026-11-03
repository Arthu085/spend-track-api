import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { describeError } from '@shared/application/logging';
import { FINANCE_TIME_ZONE } from '@shared/domain/calendar';
import { GenerateDueRecurrenceOccurrencesUseCase } from '../../application/use-cases/generate-due-recurrence-occurrences.use-case';

@Injectable()
export class RecurrenceGenerationScheduler {
  private readonly logger = new Logger(RecurrenceGenerationScheduler.name);

  constructor(
    private readonly generateDueOccurrences: GenerateDueRecurrenceOccurrencesUseCase,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM, {
    name: 'recurrence-generation',
    timeZone: FINANCE_TIME_ZONE,
  })
  async handleGeneration(): Promise<void> {
    try {
      const generated = await this.generateDueOccurrences.execute();

      this.logger.log(
        `Recurrence generation extended ${generated} recurrence(s)`,
      );
    } catch (error) {
      this.logger.error({
        msg: 'Recurrence generation failed',
        error: describeError(error),
      });
    }
  }
}
