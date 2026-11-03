import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

export class BudgetMonthParamsDto {
  @ApiProperty({ minimum: MIN_YEAR, maximum: MAX_YEAR, example: 2026 })
  @Type(() => Number)
  @IsInt({ message: i18nValidationMessage('validation.IS_INT') })
  @Min(MIN_YEAR, { message: i18nValidationMessage('validation.MIN') })
  @Max(MAX_YEAR, { message: i18nValidationMessage('validation.MAX') })
  year!: number;

  @ApiProperty({ minimum: 1, maximum: 12, example: 11 })
  @Type(() => Number)
  @IsInt({ message: i18nValidationMessage('validation.IS_INT') })
  @Min(1, { message: i18nValidationMessage('validation.MIN') })
  @Max(12, { message: i18nValidationMessage('validation.MAX') })
  month!: number;
}
