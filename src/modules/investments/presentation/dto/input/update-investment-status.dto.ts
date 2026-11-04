import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';

export class UpdateInvestmentStatusDto {
  @ApiProperty({
    enum: RecordStatus,
    description: 'INACTIVE archives the investment; ACTIVE reactivates it.',
  })
  @IsEnum(RecordStatus, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  status!: RecordStatus;
}
