import { CategoryEntity } from '../../domain/entities/category.entity';
import { CategoryNotFoundError } from '../../domain/errors/category-not-found.error';
import type { CategoryRepository } from '../../domain/repositories/category.repository';

export async function findVisibleCategory(
  categoryRepository: CategoryRepository,
  uuid: string,
  ownerId: number,
): Promise<CategoryEntity> {
  const category = await categoryRepository.findVisibleByUuid(uuid, ownerId);

  if (!category) {
    throw new CategoryNotFoundError();
  }

  return category;
}
