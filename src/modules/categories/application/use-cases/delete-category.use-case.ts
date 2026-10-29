import { Inject, Injectable } from '@nestjs/common';
import { assertCategoryEditable } from '../../domain/policies/assert-category-editable.policy';
import {
  CATEGORY_REPOSITORY,
  type CategoryRepository,
} from '../../domain/repositories/category.repository';
import { findVisibleCategory } from '../services/find-visible-category';

export interface DeleteCategoryInput {
  uuid: string;
  ownerId: number;
}

@Injectable()
export class DeleteCategoryUseCase {
  constructor(
    @Inject(CATEGORY_REPOSITORY)
    private readonly categoryRepository: CategoryRepository,
  ) {}

  async execute(input: DeleteCategoryInput): Promise<void> {
    const category = await findVisibleCategory(
      this.categoryRepository,
      input.uuid,
      input.ownerId,
    );

    assertCategoryEditable(category);

    await this.categoryRepository.softDelete(category);
  }
}
