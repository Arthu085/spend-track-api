import { ValidateIf } from 'class-validator';
import { CategoryColorField, CategoryNameField } from './category-fields';

const isProvided = (_: object, value: unknown): boolean => value !== undefined;

export class UpdateCategoryDto {
  @ValidateIf(isProvided)
  @CategoryNameField(false)
  name?: string;

  @ValidateIf(isProvided)
  @CategoryColorField()
  color?: string;
}
