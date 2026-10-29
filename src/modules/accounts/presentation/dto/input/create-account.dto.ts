import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { DateOnlyField, MoneyField } from '@shared/presentation/dto';
import { AccountType } from '../../../domain/enums/account-type.enum';
import { AccountNameField } from './account-name.field';

export class CreateAccountDto {
  @AccountNameField()
  name!: string;

  @ApiProperty({ enum: AccountType })
  @IsEnum(AccountType, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  type!: AccountType;

  @MoneyField({
    example: '1500.00',
    description:
      'Balance on openingBalanceDate as a decimal string in BRL; may be negative.',
  })
  openingBalance!: string;

  @DateOnlyField({ example: '2026-10-01' })
  openingBalanceDate!: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Makes this the default account, replacing the previous one.',
  })
  @IsOptional()
  @IsBoolean({ message: i18nValidationMessage('validation.IS_BOOLEAN') })
  isDefault?: boolean;
}
