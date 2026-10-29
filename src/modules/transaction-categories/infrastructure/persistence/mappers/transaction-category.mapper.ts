import { TransactionCategoryEntity } from '../../../domain/entities/transaction-category.entity';
import { TransactionCategoryOrmEntity } from '../entities/transaction-category.orm-entity';

export class TransactionCategoryMapper {
  static toDomain(
    orm: TransactionCategoryOrmEntity,
  ): TransactionCategoryEntity {
    return TransactionCategoryEntity.reconstitute({
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

  static toOrm(
    domain: TransactionCategoryEntity,
  ): TransactionCategoryOrmEntity {
    const orm = new TransactionCategoryOrmEntity();

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
