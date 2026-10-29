import { Inject, Injectable } from '@nestjs/common';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { CategoryEntity } from '../../domain/entities/category.entity';
import { assertCategoryEditable } from '../../domain/policies/assert-category-editable.policy';
import {
  CATEGORY_REPOSITORY,
  type CategoryRepository,
} from '../../domain/repositories/category.repository';
import { findVisibleCategory } from '../services/find-visible-category';

export interface UpdateCategoryStatusInput {
  uuid: string;
  ownerId: number;
  status: RecordStatus;
}

@Injectable()
export class UpdateCategoryStatusUseCase {
  constructor(
    @Inject(CATEGORY_REPOSITORY)
    private readonly categoryRepository: CategoryRepository,
  ) {}

  async execute(input: UpdateCategoryStatusInput): Promise<CategoryEntity> {
    const category = await findVisibleCategory(
      this.categoryRepository,
      input.uuid,
      input.ownerId,
    );

    assertCategoryEditable(category);

    return this.categoryRepository.update(category.withStatus(input.status));
  }
}
