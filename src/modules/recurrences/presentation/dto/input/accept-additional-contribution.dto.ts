import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, Max, Min, ValidateIf } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { TransactionState } from '@modules/transactions';
import {
  TransactionAmountField,
  isPresent,
} from '@modules/transactions/presentation';
import { DateOnlyField } from '@shared/presentation/dto';
import { MAX_PLAN_YEAR, MIN_PLAN_YEAR } from './saving-plans-query.dto';

const ACCEPTED_STATES = [
  TransactionState.COMPLETED,
  TransactionState.PLANNED,
] as const;

export class AcceptAdditionalContributionDto {
  @ApiProperty({ minimum: MIN_PLAN_YEAR, maximum: MAX_PLAN_YEAR })
  @IsInt({ message: i18nValidationMessage('validation.IS_INT') })
  @Min(MIN_PLAN_YEAR, { message: i18nValidationMessage('validation.MIN') })
  @Max(MAX_PLAN_YEAR, { message: i18nValidationMessage('validation.MAX') })
  year!: number;

  @ApiProperty({ minimum: 1, maximum: 12 })
  @IsInt({ message: i18nValidationMessage('validation.IS_INT') })
  @Min(1, { message: i18nValidationMessage('validation.MIN') })
  @Max(12, { message: i18nValidationMessage('validation.MAX') })
  month!: number;

  @TransactionAmountField()
  amount!: string;

  @ValidateIf(isPresent)
  @DateOnlyField({
    example: '2026-11-20',
    required: false,
    description:
      'Inside the month; defaults to today in the current month and to the first day of a later one.',
  })
  date?: string;

  @ApiProperty({
    enum: ACCEPTED_STATES,
    description:
      'COMPLETED moves the money now and needs a date up to today; PLANNED only lowers the projection until it is confirmed, and may be dated in the future.',
  })
  @IsIn(ACCEPTED_STATES, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  state!: TransactionState.COMPLETED | TransactionState.PLANNED;
}
