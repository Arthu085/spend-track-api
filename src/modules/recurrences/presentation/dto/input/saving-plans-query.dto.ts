import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export const MIN_PLAN_YEAR = 2000;
export const MAX_PLAN_YEAR = 2100;

export class SavingPlansQueryDto {
  @ApiProperty({ minimum: MIN_PLAN_YEAR, maximum: MAX_PLAN_YEAR })
  @Type(() => Number)
  @IsInt({ message: i18nValidationMessage('validation.IS_INT') })
  @Min(MIN_PLAN_YEAR, { message: i18nValidationMessage('validation.MIN') })
  @Max(MAX_PLAN_YEAR, { message: i18nValidationMessage('validation.MAX') })
  year!: number;

  @ApiProperty({ minimum: 1, maximum: 12 })
  @Type(() => Number)
  @IsInt({ message: i18nValidationMessage('validation.IS_INT') })
  @Min(1, { message: i18nValidationMessage('validation.MIN') })
  @Max(12, { message: i18nValidationMessage('validation.MAX') })
  month!: number;
}
