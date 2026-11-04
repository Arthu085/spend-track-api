import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsUUID, ValidateIf } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { TransactionState } from '@modules/transactions';
import {
  AllowedOnlyWhen,
  TransactionAmountField,
  isPresent,
} from '@modules/transactions/presentation';
import { DateOnlyField } from '@shared/presentation/dto';
import { InvestmentMovementType } from '../../../domain/enums/investment-movement-type.enum';

const MOVEMENT_TYPES = [
  InvestmentMovementType.CONTRIBUTION,
  InvestmentMovementType.WITHDRAWAL,
] as const;

const CREATABLE_STATES = [
  TransactionState.PLANNED,
  TransactionState.COMPLETED,
] as const;

export class CreateInvestmentMovementDto {
  @ApiProperty({
    enum: MOVEMENT_TYPES,
    description:
      'CONTRIBUTION moves money from the account into the investment; WITHDRAWAL moves it back.',
  })
  @IsIn(MOVEMENT_TYPES, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  type!:
    | InvestmentMovementType.CONTRIBUTION
    | InvestmentMovementType.WITHDRAWAL;

  @ApiProperty({
    description:
      'An active account of yours the money leaves (contribution) or enters (withdrawal).',
  })
  @IsUUID(undefined, { message: i18nValidationMessage('validation.IS_UUID') })
  accountUuid!: string;

  @TransactionAmountField()
  amount!: string;

  @DateOnlyField({ example: '2026-11-05' })
  date!: string;

  @ApiProperty({
    enum: CREATABLE_STATES,
    description:
      'PLANNED affects projections only; COMPLETED changes the account balance and the investment value.',
  })
  @IsIn(CREATABLE_STATES, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  state!: TransactionState.PLANNED | TransactionState.COMPLETED;

  @ValidateIf(isPresent)
  @DateOnlyField({ example: '2026-11-05', required: false })
  @AllowedOnlyWhen<CreateInvestmentMovementDto>(
    (dto) => dto.state === TransactionState.COMPLETED,
  )
  completedOn?: string;
}
