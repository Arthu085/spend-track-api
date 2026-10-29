import { Inject, Injectable } from '@nestjs/common';
import { assertRecordActive } from '@shared/domain/policies';
import { CategoryEntity } from '../../domain/entities/category.entity';
import { InactiveCategoryError } from '../../domain/errors/inactive-category.error';
import {
  CATEGORY_REPOSITORY,
  type CategoryRepository,
} from '../../domain/repositories/category.repository';
import { findVisibleCategory } from '../services/find-visible-category';

@Injectable()
export class GetCategoryUseCase {
  constructor(
    @Inject(CATEGORY_REPOSITORY)
    private readonly categoryRepository: CategoryRepository,
  ) {}

  async execute(uuid: string, ownerId: number): Promise<CategoryEntity> {
    const category = await findVisibleCategory(
      this.categoryRepository,
      uuid,
      ownerId,
    );

    assertRecordActive(category, new InactiveCategoryError());

    return category;
  }
}
