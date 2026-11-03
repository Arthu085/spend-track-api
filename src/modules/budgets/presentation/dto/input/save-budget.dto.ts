import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDefined,
  IsUUID,
  Matches,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { POSITIVE_MONEY_PATTERN } from '@modules/transactions/presentation';
import { MoneyField } from '@shared/presentation/dto';

export const BUDGET_CATEGORY_LIMITS_MAX = 100;

function BudgetLimitField(options: {
  example: string;
  description: string;
}): PropertyDecorator {
  return applyDecorators(
    MoneyField(options),
    Matches(POSITIVE_MONEY_PATTERN, {
      message: i18nValidationMessage('validation.IS_POSITIVE_MONEY'),
    }),
  );
}

export class BudgetCategoryLimitDto {
  @ApiProperty({
    description:
      'Active global or personal EXPENSE category. A category already in this month’s budget may stay even after being deactivated or deleted.',
  })
  @IsUUID(undefined, { message: i18nValidationMessage('validation.IS_UUID') })
  categoryUuid!: string;

  @BudgetLimitField({
    example: '800.00',
    description:
      'Strictly positive spending limit in BRL for the category, sent as a string.',
  })
  limit!: string;
}

export class SaveBudgetDto {
  @ApiProperty({ type: String, nullable: true })
  @ValidateIf((_: object, value: unknown) => value !== null)
  @IsDefined({ message: i18nValidationMessage('validation.REQUIRED') })
  @BudgetLimitField({
    example: '3000.00',
    description:
      'Strictly positive overall spending limit in BRL for the month, sent as a string; null to set category limits only.',
  })
  totalLimit!: string | null;

  @ApiProperty({
    type: [BudgetCategoryLimitDto],
    maxItems: BUDGET_CATEGORY_LIMITS_MAX,
    description:
      'Replaces every category limit of the month; one entry per category, empty for none.',
  })
  @IsArray({ message: i18nValidationMessage('validation.IS_ARRAY') })
  @ArrayMaxSize(BUDGET_CATEGORY_LIMITS_MAX, {
    message: i18nValidationMessage('validation.ARRAY_MAX_SIZE'),
  })
  @ArrayUnique((entry: BudgetCategoryLimitDto) => entry.categoryUuid, {
    message: i18nValidationMessage('validation.ARRAY_UNIQUE'),
  })
  @ValidateNested({ each: true })
  @Type(() => BudgetCategoryLimitDto)
  categoryLimits!: BudgetCategoryLimitDto[];
}
