import { TransactionCategoryMapper } from '@modules/transaction-categories/persistence';
import { formatMoney, parseMoney } from '@shared/domain/money';
import { RecurrenceCardChargeEntity } from '../../../domain/entities/recurrence-card-charge.entity';
import { RecurrenceCardChargeOrmEntity } from '../entities/recurrence-card-charge.orm-entity';

export class RecurrenceCardChargeMapper {
  static toDomain(
    orm: RecurrenceCardChargeOrmEntity,
  ): RecurrenceCardChargeEntity {
    if (!orm.category) {
      throw new Error('Card charge category relation must be loaded');
    }

    if (orm.creditCardPurchaseId !== null && !orm.creditCardPurchase) {
      throw new Error('Card charge purchase relation must be loaded');
    }

    return RecurrenceCardChargeEntity.reconstitute({
      id: orm.id,
      uuid: orm.uuid,
      status: orm.status,
      ownerId: orm.userId,
      recurrenceId: orm.recurrenceId,
      occurrenceDate: orm.occurrenceDate,
      date: orm.date,
      description: orm.description,
      amount: parseMoney(orm.amount),
      category: TransactionCategoryMapper.toDomain(orm.category),
      invoiceMonth: orm.invoiceMonth,
      state: orm.state,
      canceledAt: orm.canceledAt,
      purchase:
        orm.creditCardPurchaseId !== null && orm.creditCardPurchase
          ? { id: orm.creditCardPurchaseId, uuid: orm.creditCardPurchase.uuid }
          : null,
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
      deletedAt: orm.deletedAt,
    });
  }

  static toOrm(
    domain: RecurrenceCardChargeEntity,
  ): RecurrenceCardChargeOrmEntity {
    const orm = new RecurrenceCardChargeOrmEntity();

    if (domain.id > 0) {
      orm.id = domain.id;
      orm.updatedAt = domain.updatedAt;
    }

    orm.uuid = domain.uuid;
    orm.status = domain.status;
    orm.userId = domain.ownerId;
    orm.recurrenceId = domain.recurrenceId;
    orm.occurrenceDate = domain.occurrenceDate;
    orm.date = domain.date;
    orm.description = domain.description;
    orm.amount = formatMoney(domain.amount);
    orm.categoryId = domain.category.id;
    orm.invoiceMonth = domain.invoiceMonth;
    orm.state = domain.state;
    orm.canceledAt = domain.canceledAt;
    orm.creditCardPurchaseId = domain.purchase?.id ?? null;
    orm.deletedAt = domain.deletedAt;

    return orm;
  }
}
