import { AccountMapper } from '@modules/accounts/persistence';
import { CreditCardMapper } from '@modules/credit-cards/persistence';
import { TransactionCategoryMapper } from '@modules/transaction-categories/persistence';
import { formatMoney, parseMoney } from '@shared/domain/money';
import { RecurrenceEntity } from '../../../domain/entities/recurrence.entity';
import { RecurrenceOrmEntity } from '../entities/recurrence.orm-entity';

export class RecurrenceMapper {
  static toDomain(orm: RecurrenceOrmEntity): RecurrenceEntity {
    if (!orm.category) {
      throw new Error('Recurrence category relation must be loaded');
    }

    return RecurrenceEntity.reconstitute({
      id: orm.id,
      uuid: orm.uuid,
      status: orm.status,
      ownerId: orm.userId,
      type: orm.type,
      description: orm.description,
      amount: parseMoney(orm.amount),
      frequency: orm.frequency,
      startDate: orm.startDate,
      endDate: orm.endDate,
      state: orm.state,
      account: orm.account ? AccountMapper.toDomain(orm.account) : null,
      creditCard: orm.creditCard
        ? CreditCardMapper.toDomain(orm.creditCard)
        : null,
      category: TransactionCategoryMapper.toDomain(orm.category),
      notes: orm.notes,
      generatedThrough: orm.generatedThrough,
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
      deletedAt: orm.deletedAt,
    });
  }

  static toOrm(domain: RecurrenceEntity): RecurrenceOrmEntity {
    const orm = new RecurrenceOrmEntity();

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
    orm.frequency = domain.frequency;
    orm.startDate = domain.startDate;
    orm.endDate = domain.endDate;
    orm.state = domain.state;
    orm.accountId = domain.account?.id ?? null;
    orm.creditCardId = domain.creditCard?.id ?? null;
    orm.categoryId = domain.category.id;
    orm.notes = domain.notes;
    orm.generatedThrough = domain.generatedThrough;
    orm.deletedAt = domain.deletedAt;

    return orm;
  }
}
