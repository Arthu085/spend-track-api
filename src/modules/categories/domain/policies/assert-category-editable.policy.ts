import { CategoryEntity } from '../entities/category.entity';
import { CategoryScope } from '../enums/category-scope.enum';
import { GlobalCategoryReadOnlyError } from '../errors/global-category-read-only.error';

export function assertCategoryEditable(category: CategoryEntity): void {
  if (category.scope === CategoryScope.GLOBAL) {
    throw new GlobalCategoryReadOnlyError();
  }
}
