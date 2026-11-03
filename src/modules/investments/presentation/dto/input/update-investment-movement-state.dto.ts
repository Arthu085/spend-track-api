import { ApiProperty } from '@nestjs/swagger';
import { IsIn, ValidateIf } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { TransactionState } from '@modules/transactions';
import { AllowedOnlyWhen, isPresent } from '@modules/transactions/presentation';
import { DateOnlyField } from '@shared/presentation/dto';

const TARGET_STATES = [
  TransactionState.COMPLETED,
  TransactionState.CANCELED,
] as const;

export class UpdateInvestmentMovementStateDto {
  @ApiProperty({
    enum: TARGET_STATES,
    description:
      'COMPLETED confirms a planned contribution or withdrawal; CANCELED cancels a planned or completed movement.',
  })
  @IsIn(TARGET_STATES, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  state!: TransactionState.COMPLETED | TransactionState.CANCELED;

  @ValidateIf(isPresent)
  @DateOnlyField({ example: '2026-11-05', required: false })
  @AllowedOnlyWhen<UpdateInvestmentMovementStateDto>(
    (dto) => dto.state === TransactionState.COMPLETED,
  )
  completedOn?: string;
}
