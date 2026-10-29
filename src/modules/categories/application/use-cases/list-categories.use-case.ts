import { Inject, Injectable } from '@nestjs/common';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { CategoryEntity } from '../../domain/entities/category.entity';
import { CategoryKind } from '../../domain/enums/category-kind.enum';
import { CategoryScope } from '../../domain/enums/category-scope.enum';
import {
  CATEGORY_REPOSITORY,
  type CategoryRepository,
} from '../../domain/repositories/category.repository';

export interface ListCategoriesInput {
  ownerId: number;
  kind?: CategoryKind;
  scope?: CategoryScope;
  status?: RecordStatus;
}

@Injectable()
export class ListCategoriesUseCase {
  constructor(
    @Inject(CATEGORY_REPOSITORY)
    private readonly categoryRepository: CategoryRepository,
  ) {}

  async execute(input: ListCategoriesInput): Promise<CategoryEntity[]> {
    return this.categoryRepository.findAllVisibleTo(input.ownerId, {
      kind: input.kind,
      scope: input.scope,
      status: input.status ?? RecordStatus.ACTIVE,
    });
  }
}
