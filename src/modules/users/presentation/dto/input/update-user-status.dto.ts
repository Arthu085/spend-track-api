import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';

export class UpdateUserStatusDto {
  @ApiProperty({ enum: RecordStatus })
  @IsEnum(RecordStatus, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  status!: RecordStatus;
}
