import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsEnum, ValidateIf } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { DashboardCard } from '../../../domain/enums/dashboard-card.enum';
import { DefaultMonth } from '../../../domain/enums/default-month.enum';
import { SpendingPerspective } from '../../../domain/enums/spending-perspective.enum';

const isProvided = (_: object, value: unknown): boolean => value !== undefined;

export class UpdatePreferencesDto {
  @ApiPropertyOptional({ enum: SpendingPerspective })
  @ValidateIf(isProvided)
  @IsEnum(SpendingPerspective, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  spendingPerspective?: SpendingPerspective;

  @ApiPropertyOptional({ enum: DefaultMonth })
  @ValidateIf(isProvided)
  @IsEnum(DefaultMonth, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  defaultMonth?: DefaultMonth;

  @ApiPropertyOptional({
    enum: DashboardCard,
    isArray: true,
    uniqueItems: true,
    description:
      'Dashboard cards that start collapsed. Replaces the whole stored list; an empty array starts every card visible.',
  })
  @ValidateIf(isProvided)
  @IsArray({ message: i18nValidationMessage('validation.IS_ARRAY') })
  @ArrayUnique({ message: i18nValidationMessage('validation.ARRAY_UNIQUE') })
  @IsEnum(DashboardCard, {
    each: true,
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  collapsedDashboardCards?: DashboardCard[];
}
