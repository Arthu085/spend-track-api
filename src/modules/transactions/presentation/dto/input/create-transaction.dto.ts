import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDefined, IsEnum, IsIn, IsUUID, ValidateIf } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { DateOnlyField } from '@shared/presentation/dto';
import { TransactionState } from '../../../domain/enums/transaction-state.enum';
import { TransactionType } from '../../../domain/enums/transaction-type.enum';
import {
  AllowedOnlyWhen,
  TransactionAmountField,
  TransactionDescriptionField,
  TransactionNotesField,
  isPresent,
} from './transaction-fields';

const CREATABLE_STATES = [
  TransactionState.PLANNED,
  TransactionState.COMPLETED,
] as const;

const isTransfer = (dto: CreateTransactionDto): boolean =>
  dto.type === TransactionType.TRANSFER;

export class CreateTransactionDto {
  @ApiProperty({
    enum: TransactionType,
    description: 'Fixed at creation.',
  })
  @IsEnum(TransactionType, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  type!: TransactionType;

  @TransactionDescriptionField()
  description!: string;

  @TransactionAmountField()
  amount!: string;

  @DateOnlyField({ example: '2026-10-29' })
  date!: string;

  @ApiProperty({
    enum: CREATABLE_STATES,
    description:
      'PLANNED affects projections only; COMPLETED changes balances.',
  })
  @IsIn(CREATABLE_STATES, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  state!: TransactionState.PLANNED | TransactionState.COMPLETED;

  @ValidateIf(isPresent)
  @DateOnlyField({ example: '2026-10-29', required: false })
  @AllowedOnlyWhen<CreateTransactionDto>(
    (dto) => dto.state === TransactionState.COMPLETED,
  )
  completedOn?: string;

  @ApiProperty({
    description:
      'Source account for expenses and transfers, destination for income.',
  })
  @IsUUID(undefined, { message: i18nValidationMessage('validation.IS_UUID') })
  accountUuid!: string;

  @ApiPropertyOptional({
    description: 'Required for TRANSFER, not allowed otherwise.',
  })
  @ValidateIf(
    (dto: CreateTransactionDto, value) =>
      isTransfer(dto) || isPresent(dto, value),
  )
  @IsDefined({ message: i18nValidationMessage('validation.REQUIRED') })
  @IsUUID(undefined, { message: i18nValidationMessage('validation.IS_UUID') })
  @AllowedOnlyWhen(isTransfer)
  destinationAccountUuid?: string;

  @ApiPropertyOptional({
    description:
      'Required for INCOME and EXPENSE with a category of the same kind; not allowed for TRANSFER.',
  })
  @ValidateIf(
    (dto: CreateTransactionDto, value) =>
      !isTransfer(dto) || isPresent(dto, value),
  )
  @IsDefined({ message: i18nValidationMessage('validation.REQUIRED') })
  @IsUUID(undefined, { message: i18nValidationMessage('validation.IS_UUID') })
  @AllowedOnlyWhen((dto: CreateTransactionDto) => !isTransfer(dto))
  categoryUuid?: string;

  @ValidateIf(isPresent)
  @TransactionNotesField()
  notes?: string | null;
}
