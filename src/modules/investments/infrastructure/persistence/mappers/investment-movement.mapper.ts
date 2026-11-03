import { AccountMapper } from '@modules/accounts/persistence';
import { formatMoney, parseMoney } from '@shared/domain/money';
import { InvestmentMovementEntity } from '../../../domain/entities/investment-movement.entity';
import { InvestmentMovementOrmEntity } from '../entities/investment-movement.orm-entity';

export class InvestmentMovementMapper {
  static toDomain(orm: InvestmentMovementOrmEntity): InvestmentMovementEntity {
    if (orm.accountId !== null && !orm.account) {
      throw new Error('Movement account relation must be loaded');
    }

    return InvestmentMovementEntity.reconstitute({
      id: orm.id,
      uuid: orm.uuid,
      status: orm.status,
      ownerId: orm.userId,
      investmentId: orm.investmentId,
      type: orm.type,
      account: orm.account ? AccountMapper.toDomain(orm.account) : null,
      amount: parseMoney(orm.amount),
      date: orm.date,
      state: orm.state,
      completedOn: orm.completedOn,
      canceledAt: orm.canceledAt,
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
      deletedAt: orm.deletedAt,
    });
  }

  static toOrm(domain: InvestmentMovementEntity): InvestmentMovementOrmEntity {
    const orm = new InvestmentMovementOrmEntity();

    if (domain.id > 0) {
      orm.id = domain.id;
      orm.updatedAt = domain.updatedAt;
    }

    orm.uuid = domain.uuid;
    orm.status = domain.status;
    orm.userId = domain.ownerId;
    orm.investmentId = domain.investmentId;
    orm.type = domain.type;
    orm.accountId = domain.account?.id ?? null;
    orm.amount = formatMoney(domain.amount);
    orm.date = domain.date;
    orm.state = domain.state;
    orm.completedOn = domain.completedOn;
    orm.canceledAt = domain.canceledAt;
    orm.deletedAt = domain.deletedAt;

    return orm;
  }
}
