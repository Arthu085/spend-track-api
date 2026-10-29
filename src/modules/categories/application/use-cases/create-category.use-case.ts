import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  CategoryEntity,
  type CategoryDetails,
} from '../../domain/entities/category.entity';
import { CategoryKind } from '../../domain/enums/category-kind.enum';
import {
  CATEGORY_REPOSITORY,
  type CategoryRepository,
} from '../../domain/repositories/category.repository';

export interface CreateCategoryInput extends CategoryDetails {
  ownerId: number;
  kind: CategoryKind;
}

@Injectable()
export class CreateCategoryUseCase {
  constructor(
    @Inject(CATEGORY_REPOSITORY)
    private readonly categoryRepository: CategoryRepository,
  ) {}

  async execute(input: CreateCategoryInput): Promise<CategoryEntity> {
    return this.categoryRepository.create(
      CategoryEntity.createPersonal({ ...input, uuid: randomUUID() }),
    );
  }
}
