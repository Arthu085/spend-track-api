import { formatMoney, parseMoney } from '@shared/domain/money';
import { InvestmentEntity } from '../../../domain/entities/investment.entity';
import { InvestmentOrmEntity } from '../entities/investment.orm-entity';

export class InvestmentMapper {
  static toDomain(orm: InvestmentOrmEntity): InvestmentEntity {
    return InvestmentEntity.reconstitute({
      id: orm.id,
      uuid: orm.uuid,
      status: orm.status,
      ownerId: orm.userId,
      name: orm.name,
      type: orm.type,
      targetAmount:
        orm.targetAmount === null ? null : parseMoney(orm.targetAmount),
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
      deletedAt: orm.deletedAt,
    });
  }

  static toOrm(domain: InvestmentEntity): InvestmentOrmEntity {
    const orm = new InvestmentOrmEntity();

    if (domain.id > 0) {
      orm.id = domain.id;
      orm.updatedAt = domain.updatedAt;
    }

    orm.uuid = domain.uuid;
    orm.status = domain.status;
    orm.userId = domain.ownerId;
    orm.name = domain.name;
    orm.type = domain.type;
    orm.targetAmount =
      domain.targetAmount === null ? null : formatMoney(domain.targetAmount);
    orm.deletedAt = domain.deletedAt;

    return orm;
  }
}
