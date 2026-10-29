import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { CategoryKind } from '../../../domain/enums/category-kind.enum';
import { CategoryColorField, CategoryNameField } from './category-fields';

export class CreateCategoryDto {
  @CategoryNameField()
  name!: string;

  @ApiProperty({
    enum: CategoryKind,
    description: 'Transaction type the category applies to; cannot change.',
  })
  @IsEnum(CategoryKind, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  kind!: CategoryKind;

  @IsOptional()
  @CategoryColorField()
  color?: string;
}
