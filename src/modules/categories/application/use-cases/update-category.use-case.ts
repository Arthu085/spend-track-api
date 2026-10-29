import { Inject, Injectable } from '@nestjs/common';
import { assertRecordActive } from '@shared/domain/policies';
import { CategoryEntity } from '../../domain/entities/category.entity';
import { InactiveCategoryError } from '../../domain/errors/inactive-category.error';
import { assertCategoryEditable } from '../../domain/policies/assert-category-editable.policy';
import {
  CATEGORY_REPOSITORY,
  type CategoryRepository,
} from '../../domain/repositories/category.repository';
import { findVisibleCategory } from '../services/find-visible-category';

export interface UpdateCategoryInput {
  uuid: string;
  ownerId: number;
  name?: string;
  color?: string;
}

@Injectable()
export class UpdateCategoryUseCase {
  constructor(
    @Inject(CATEGORY_REPOSITORY)
    private readonly categoryRepository: CategoryRepository,
  ) {}

  async execute(input: UpdateCategoryInput): Promise<CategoryEntity> {
    const category = await findVisibleCategory(
      this.categoryRepository,
      input.uuid,
      input.ownerId,
    );

    assertCategoryEditable(category);
    assertRecordActive(category, new InactiveCategoryError());

    return this.categoryRepository.update(
      category.withDetails({
        name: input.name ?? category.name,
        color: input.color ?? category.color,
      }),
    );
  }
}
