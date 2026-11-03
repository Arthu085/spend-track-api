import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { RecurrenceState } from '../../../domain/enums/recurrence-state.enum';

const TARGET_STATES = [RecurrenceState.ACTIVE, RecurrenceState.PAUSED] as const;

export class UpdateRecurrenceStateDto {
  @ApiProperty({
    enum: TARGET_STATES,
    description:
      'PAUSED removes planned occurrences dated today or later and stops generation; ACTIVE resumes it from today.',
  })
  @IsIn(TARGET_STATES, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  state!: RecurrenceState.ACTIVE | RecurrenceState.PAUSED;
}
