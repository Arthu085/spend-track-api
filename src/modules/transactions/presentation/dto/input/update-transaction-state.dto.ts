import { ApiProperty } from '@nestjs/swagger';
import { IsIn, ValidateIf } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { DateOnlyField } from '@shared/presentation/dto';
import { TransactionState } from '../../../domain/enums/transaction-state.enum';
import { AllowedOnlyWhen, isPresent } from './transaction-fields';

const TARGET_STATES = [
  TransactionState.COMPLETED,
  TransactionState.CANCELED,
] as const;

export class UpdateTransactionStateDto {
  @ApiProperty({
    enum: TARGET_STATES,
    description:
      'COMPLETED confirms a planned transaction; CANCELED cancels a planned or completed one.',
  })
  @IsIn(TARGET_STATES, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  state!: TransactionState.COMPLETED | TransactionState.CANCELED;

  @ValidateIf(isPresent)
  @DateOnlyField({ example: '2026-10-29', required: false })
  @AllowedOnlyWhen<UpdateTransactionStateDto>(
    (dto) => dto.state === TransactionState.COMPLETED,
  )
  completedOn?: string;
}
