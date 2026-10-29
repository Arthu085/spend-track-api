import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { CategoryEntity } from '../entities/category.entity';
import { CategoryKind } from '../enums/category-kind.enum';
import { CategoryScope } from '../enums/category-scope.enum';

export const CATEGORY_REPOSITORY = Symbol('CATEGORY_REPOSITORY');

export interface CategoryListFilters {
  kind?: CategoryKind;
  scope?: CategoryScope;
  status?: RecordStatus;
}

export interface CategoryRepository {
  findAllVisibleTo(
    ownerId: number,
    filters?: CategoryListFilters,
  ): Promise<CategoryEntity[]>;
  findVisibleByUuid(
    uuid: string,
    ownerId: number,
  ): Promise<CategoryEntity | null>;
  create(category: CategoryEntity): Promise<CategoryEntity>;
  update(category: CategoryEntity): Promise<CategoryEntity>;
}
