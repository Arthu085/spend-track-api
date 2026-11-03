import { formatMoney, parseMoney } from '@shared/domain/money';
import { CreditCardRefundEntity } from '../../../domain/entities/credit-card-refund.entity';
import { CreditCardRefundOrmEntity } from '../entities/credit-card-refund.orm-entity';
import { CreditCardInvoiceMapper } from './credit-card-invoice.mapper';

export class CreditCardRefundMapper {
  static toDomain(orm: CreditCardRefundOrmEntity): CreditCardRefundEntity {
    if (!orm.purchase || !orm.invoice) {
      throw new Error('Refund purchase and invoice relations must be loaded');
    }

    return CreditCardRefundEntity.reconstitute({
      id: orm.id,
      uuid: orm.uuid,
      status: orm.status,
      ownerId: orm.userId,
      purchase: {
        id: orm.purchase.id,
        uuid: orm.purchase.uuid,
        description: orm.purchase.description,
      },
      invoice: CreditCardInvoiceMapper.toDomain(orm.invoice),
      amount: parseMoney(orm.amount),
      date: orm.date,
      notes: orm.notes,
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
      deletedAt: orm.deletedAt,
    });
  }

  static toOrm(domain: CreditCardRefundEntity): CreditCardRefundOrmEntity {
    const orm = new CreditCardRefundOrmEntity();

    if (domain.id > 0) {
      orm.id = domain.id;
      orm.updatedAt = domain.updatedAt;
    }

    orm.uuid = domain.uuid;
    orm.status = domain.status;
    orm.userId = domain.ownerId;
    orm.purchaseId = domain.purchase.id;
    orm.invoiceId = domain.invoice.id;
    orm.amount = formatMoney(domain.amount);
    orm.date = domain.date;
    orm.notes = domain.notes;
    orm.deletedAt = domain.deletedAt;

    return orm;
  }
}
