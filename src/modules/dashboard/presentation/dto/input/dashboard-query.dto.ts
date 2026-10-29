import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { SpendingPerspective } from '@modules/preferences';

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

const isMonthRequested = (query: DashboardQueryDto): boolean =>
  query.year !== undefined || query.month !== undefined;

export class DashboardQueryDto {
  @ApiPropertyOptional({
    minimum: MIN_YEAR,
    maximum: MAX_YEAR,
    description:
      'Year of the month to show; send it with month. Both omitted open the preferred default month.',
  })
  @ValidateIf(isMonthRequested)
  @Type(() => Number)
  @IsInt({ message: i18nValidationMessage('validation.IS_INT') })
  @Min(MIN_YEAR, { message: i18nValidationMessage('validation.MIN') })
  @Max(MAX_YEAR, { message: i18nValidationMessage('validation.MAX') })
  year?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 12,
    description: 'Month to show (1–12); send it with year.',
  })
  @ValidateIf(isMonthRequested)
  @Type(() => Number)
  @IsInt({ message: i18nValidationMessage('validation.IS_INT') })
  @Min(1, { message: i18nValidationMessage('validation.MIN') })
  @Max(12, { message: i18nValidationMessage('validation.MAX') })
  month?: number;

  @ApiPropertyOptional({
    enum: SpendingPerspective,
    description:
      'Overrides the stored spending perspective for this request only.',
  })
  @IsOptional()
  @IsEnum(SpendingPerspective, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  perspective?: SpendingPerspective;
}
