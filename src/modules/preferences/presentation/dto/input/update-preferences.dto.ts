import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, ValidateIf } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
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
}
