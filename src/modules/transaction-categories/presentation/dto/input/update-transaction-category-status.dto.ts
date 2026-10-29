import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';

export class UpdateTransactionCategoryStatusDto {
  @ApiProperty({
    enum: RecordStatus,
    description:
      'INACTIVE deactivates the transaction category; ACTIVE reactivates it.',
  })
  @IsEnum(RecordStatus, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  status!: RecordStatus;
}
