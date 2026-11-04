import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, ValidateIf } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { PendingOperationsDecision } from '@shared/domain/pending-operations';

export class UpdateCreditCardStatusDto {
  @ApiProperty({
    enum: RecordStatus,
    description: 'INACTIVE archives the card; ACTIVE reactivates it.',
  })
  @IsEnum(RecordStatus, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  status!: RecordStatus;

  @ApiPropertyOptional({
    enum: PendingOperationsDecision,
    description:
      'What happens to the planned recurring charges of a card being archived: KEEP leaves them planned, CANCEL cancels them. Required when it has any; ignored otherwise.',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(PendingOperationsDecision, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  pendingOperations?: PendingOperationsDecision;
}
