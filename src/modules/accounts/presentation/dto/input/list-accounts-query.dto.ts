import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { FINANCE_NAME_MAX_LENGTH } from '@shared/domain/constraints';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { StatusFilterField, TextFilterField } from '@shared/presentation/dto';
import { AccountType } from '../../../domain/enums/account-type.enum';

export class ListAccountsQueryDto {
  @TextFilterField({ maxLength: FINANCE_NAME_MAX_LENGTH })
  name?: string;

  @ApiPropertyOptional({
    enum: AccountType,
    description: 'Filter by account type (exact match).',
  })
  @IsOptional()
  @IsEnum(AccountType, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  type?: AccountType;

  @StatusFilterField()
  status?: RecordStatus;
}
