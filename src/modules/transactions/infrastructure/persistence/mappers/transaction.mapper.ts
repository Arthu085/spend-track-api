import { AccountMapper } from '@modules/accounts/persistence';
import { TransactionCategoryMapper } from '@modules/transaction-categories/persistence';
import { formatMoney, parseMoney } from '@shared/domain/money';
import { TransactionEntity } from '../../../domain/entities/transaction.entity';
import { TransactionOrmEntity } from '../entities/transaction.orm-entity';

export class TransactionMapper {
  static toDomain(orm: TransactionOrmEntity): TransactionEntity {
    if (!orm.account) {
      throw new Error('Transaction account relation must be loaded');
    }

    return TransactionEntity.reconstitute({
      id: orm.id,
      uuid: orm.uuid,
      status: orm.status,
      ownerId: orm.userId,
      type: orm.type,
      description: orm.description,
      amount: parseMoney(orm.amount),
      date: orm.date,
      state: orm.state,
      completedOn: orm.completedOn,
      canceledAt: orm.canceledAt,
      account: AccountMapper.toDomain(orm.account),
      destinationAccount: orm.destinationAccount
        ? AccountMapper.toDomain(orm.destinationAccount)
        : null,
      category: orm.category
        ? TransactionCategoryMapper.toDomain(orm.category)
        : null,
      notes: orm.notes,
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
      deletedAt: orm.deletedAt,
    });
  }

  static toOrm(domain: TransactionEntity): TransactionOrmEntity {
    const orm = new TransactionOrmEntity();

    if (domain.id > 0) {
      orm.id = domain.id;
      orm.updatedAt = domain.updatedAt;
    }

    orm.uuid = domain.uuid;
    orm.status = domain.status;
    orm.userId = domain.ownerId;
    orm.type = domain.type;
    orm.description = domain.description;
    orm.amount = formatMoney(domain.amount);
    orm.date = domain.date;
    orm.state = domain.state;
    orm.completedOn = domain.completedOn;
    orm.canceledAt = domain.canceledAt;
    orm.accountId = domain.account.id;
    orm.destinationAccountId = domain.destinationAccount?.id ?? null;
    orm.categoryId = domain.category?.id ?? null;
    orm.notes = domain.notes;
    orm.deletedAt = domain.deletedAt;

    return orm;
  }
}
