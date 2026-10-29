import { CategoryEntity } from '../../../domain/entities/category.entity';
import { CategoryOrmEntity } from '../entities/category.orm-entity';

export class CategoryMapper {
  static toDomain(orm: CategoryOrmEntity): CategoryEntity {
    return CategoryEntity.reconstitute({
      id: orm.id,
      uuid: orm.uuid,
      status: orm.status,
      ownerId: orm.userId,
      code: orm.code,
      name: orm.name,
      kind: orm.kind,
      color: orm.color,
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
      deletedAt: orm.deletedAt,
    });
  }

  static toOrm(domain: CategoryEntity): CategoryOrmEntity {
    const orm = new CategoryOrmEntity();

    if (domain.id > 0) {
      orm.id = domain.id;
      orm.updatedAt = domain.updatedAt;
    }

    orm.uuid = domain.uuid;
    orm.status = domain.status;
    orm.userId = domain.ownerId;
    orm.code = domain.code;
    orm.name = domain.name;
    orm.kind = domain.kind;
    orm.color = domain.color;
    orm.deletedAt = domain.deletedAt;

    return orm;
  }
}
