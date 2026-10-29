import { formatMoney, parseMoney } from '@shared/domain/money';
import { AccountEntity } from '../../../domain/entities/account.entity';
import { AccountOrmEntity } from '../entities/account.orm-entity';

export class AccountMapper {
  static toDomain(orm: AccountOrmEntity): AccountEntity {
    return AccountEntity.reconstitute({
      id: orm.id,
      uuid: orm.uuid,
      status: orm.status,
      ownerId: orm.userId,
      name: orm.name,
      type: orm.type,
      openingBalance: parseMoney(orm.openingBalance),
      openingBalanceDate: orm.openingBalanceDate,
      isDefault: orm.isDefault,
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
      deletedAt: orm.deletedAt,
    });
  }

  static toOrm(domain: AccountEntity): AccountOrmEntity {
    const orm = new AccountOrmEntity();

    if (domain.id > 0) {
      orm.id = domain.id;
      orm.updatedAt = domain.updatedAt;
    }

    orm.uuid = domain.uuid;
    orm.status = domain.status;
    orm.userId = domain.ownerId;
    orm.name = domain.name;
    orm.type = domain.type;
    orm.openingBalance = formatMoney(domain.openingBalance);
    orm.openingBalanceDate = domain.openingBalanceDate;
    orm.isDefault = domain.isDefault;
    orm.deletedAt = domain.deletedAt;

    return orm;
  }
}
