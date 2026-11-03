import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDefined, IsEnum, IsUUID, ValidateIf } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import {
  AllowedOnlyWhen,
  TransactionAmountField,
  TransactionDescriptionField,
  TransactionNotesField,
  isPresent,
} from '@modules/transactions/presentation';
import { DateOnlyField } from '@shared/presentation/dto';
import { RecurrenceFrequency } from '../../../domain/enums/recurrence-frequency.enum';
import { RecurrenceType } from '../../../domain/enums/recurrence-type.enum';

const usesCard = (dto: CreateRecurrenceDto): boolean =>
  dto.creditCardUuid !== undefined && dto.creditCardUuid !== null;

export class CreateRecurrenceDto {
  @ApiProperty({ enum: RecurrenceType, description: 'Fixed at creation.' })
  @IsEnum(RecurrenceType, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  type!: RecurrenceType;

  @TransactionDescriptionField()
  description!: string;

  @TransactionAmountField()
  amount!: string;

  @ApiProperty({
    enum: RecurrenceFrequency,
    description:
      'Occurrence k falls k weeks, months, or years after startDate (days clamped to the month end).',
  })
  @IsEnum(RecurrenceFrequency, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  frequency!: RecurrenceFrequency;

  @DateOnlyField({ example: '2026-11-15' })
  startDate!: string;

  @ValidateIf(isPresent)
  @DateOnlyField({ example: '2027-11-15', required: false })
  endDate?: string | null;

  @ApiPropertyOptional({
    description:
      'Account of the generated transactions; required unless creditCardUuid is sent, not allowed with it.',
  })
  @ValidateIf(
    (dto: CreateRecurrenceDto, value) =>
      !usesCard(dto) || isPresent(dto, value),
  )
  @IsDefined({ message: i18nValidationMessage('validation.REQUIRED') })
  @IsUUID(undefined, { message: i18nValidationMessage('validation.IS_UUID') })
  @AllowedOnlyWhen((dto: CreateRecurrenceDto) => !usesCard(dto))
  accountUuid?: string;

  @ApiPropertyOptional({
    description: 'Card of the generated charges; EXPENSE only.',
  })
  @ValidateIf(isPresent)
  @IsUUID(undefined, { message: i18nValidationMessage('validation.IS_UUID') })
  @AllowedOnlyWhen(
    (dto: CreateRecurrenceDto) => dto.type === RecurrenceType.EXPENSE,
  )
  creditCardUuid?: string;

  @ApiProperty({ description: 'Category whose kind matches the type.' })
  @IsUUID(undefined, { message: i18nValidationMessage('validation.IS_UUID') })
  categoryUuid!: string;

  @ValidateIf(isPresent)
  @TransactionNotesField()
  notes?: string | null;
}
