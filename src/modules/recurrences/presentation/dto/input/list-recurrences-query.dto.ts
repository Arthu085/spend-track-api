import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { PaginationQueryDto, TextFilterField } from '@shared/presentation/dto';
import { RecurrenceState } from '../../../domain/enums/recurrence-state.enum';
import { RecurrenceType } from '../../../domain/enums/recurrence-type.enum';

export class ListRecurrencesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: RecurrenceState,
    description:
      'Filter by state; ENDED also matches recurrences whose end date has passed.',
  })
  @IsOptional()
  @IsEnum(RecurrenceState, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  state?: RecurrenceState;

  @ApiPropertyOptional({ enum: RecurrenceType })
  @IsOptional()
  @IsEnum(RecurrenceType, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  type?: RecurrenceType;

  @TextFilterField({ maxLength: 150 })
  description?: string;
}
