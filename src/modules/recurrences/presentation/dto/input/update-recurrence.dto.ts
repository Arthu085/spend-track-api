import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsUUID, ValidateIf, ValidateNested } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import {
  AllowedOnlyWhen,
  TransactionAmountField,
  TransactionDescriptionField,
  TransactionNotesField,
  isPresent,
  isProvided,
} from '@modules/transactions/presentation';
import { DateOnlyField } from '@shared/presentation/dto';
import { RecurrenceUpdateScope } from '../../../domain/enums/recurrence-update-scope.enum';
import { SavingStrategyDto } from './saving-strategy.dto';

export class UpdateRecurrenceDto {
  @ApiProperty({
    enum: RecurrenceUpdateScope,
    description:
      'FUTURE also updates planned occurrences scheduled on or after from; ALL updates every planned occurrence. Completed and canceled occurrences never change. On an investment contribution, only a sent amount or accountUuid reaches planned occurrences.',
  })
  @IsEnum(RecurrenceUpdateScope, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  scope!: RecurrenceUpdateScope;

  @ValidateIf(isPresent)
  @DateOnlyField({
    example: '2026-12-01',
    required: false,
    description: 'FUTURE only; defaults to today.',
  })
  @AllowedOnlyWhen(
    (dto: UpdateRecurrenceDto) => dto.scope === RecurrenceUpdateScope.FUTURE,
  )
  from?: string;

  @ValidateIf(isProvided)
  @TransactionDescriptionField(false)
  description?: string;

  @ValidateIf(isProvided)
  @TransactionAmountField(false)
  amount?: string;

  @ApiPropertyOptional({
    description:
      'Category whose kind matches the type; not applicable to INVESTMENT_CONTRIBUTION.',
  })
  @ValidateIf(isProvided)
  @IsUUID(undefined, { message: i18nValidationMessage('validation.IS_UUID') })
  categoryUuid?: string;

  @ApiPropertyOptional({ description: 'Account recurrences only.' })
  @ValidateIf(isProvided)
  @IsUUID(undefined, { message: i18nValidationMessage('validation.IS_UUID') })
  accountUuid?: string;

  @ValidateIf(isPresent)
  @TransactionNotesField()
  notes?: string | null;

  @ApiPropertyOptional({
    type: SavingStrategyDto,
    nullable: true,
    description:
      'Sets the saving strategy of a MONTHLY INVESTMENT_CONTRIBUTION; null clears it, omitted keeps it. Never changes planned or completed contributions.',
  })
  @ValidateIf(isPresent)
  @ValidateNested()
  @Type(() => SavingStrategyDto)
  savingStrategy?: SavingStrategyDto | null;
}
