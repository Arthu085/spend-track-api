import { formatMoney, parseMoney } from '@shared/domain/money';
import { CreditCardEntity } from '../../../domain/entities/credit-card.entity';
import { CreditCardOrmEntity } from '../entities/credit-card.orm-entity';

export class CreditCardMapper {
  static toDomain(orm: CreditCardOrmEntity): CreditCardEntity {
    return CreditCardEntity.reconstitute({
      id: orm.id,
      uuid: orm.uuid,
      status: orm.status,
      ownerId: orm.userId,
      name: orm.name,
      creditLimit: parseMoney(orm.creditLimit),
      closingDay: orm.closingDay,
      dueDay: orm.dueDay,
      isDefault: orm.isDefault,
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
      deletedAt: orm.deletedAt,
    });
  }

  static toOrm(domain: CreditCardEntity): CreditCardOrmEntity {
    const orm = new CreditCardOrmEntity();

    if (domain.id > 0) {
      orm.id = domain.id;
      orm.updatedAt = domain.updatedAt;
    }

    orm.uuid = domain.uuid;
    orm.status = domain.status;
    orm.userId = domain.ownerId;
    orm.name = domain.name;
    orm.creditLimit = formatMoney(domain.creditLimit);
    orm.closingDay = domain.closingDay;
    orm.dueDay = domain.dueDay;
    orm.isDefault = domain.isDefault;
    orm.deletedAt = domain.deletedAt;

    return orm;
  }
}
