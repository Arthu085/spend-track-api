import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, ValidateIf } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { DateOnlyField, MoneyField } from '@shared/presentation/dto';
import { AccountType } from '../../../domain/enums/account-type.enum';
import { AccountNameField } from './account-name.field';

const isProvided = (_: object, value: unknown): boolean => value !== undefined;

export class UpdateAccountDto {
  @ValidateIf(isProvided)
  @AccountNameField(false)
  name?: string;

  @ApiPropertyOptional({ enum: AccountType })
  @ValidateIf(isProvided)
  @IsEnum(AccountType, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  type?: AccountType;

  @ValidateIf(isProvided)
  @MoneyField({ example: '1500.00', required: false })
  openingBalance?: string;

  @ValidateIf(isProvided)
  @DateOnlyField({ example: '2026-10-01', required: false })
  openingBalanceDate?: string;

  @ApiPropertyOptional({
    description:
      'true makes this the default account, replacing the previous one; false leaves the user without a default.',
  })
  @ValidateIf(isProvided)
  @IsBoolean({ message: i18nValidationMessage('validation.IS_BOOLEAN') })
  isDefault?: boolean;
}
