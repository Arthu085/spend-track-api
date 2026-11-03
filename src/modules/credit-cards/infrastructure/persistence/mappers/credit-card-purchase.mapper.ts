import { TransactionCategoryMapper } from '@modules/transaction-categories/persistence';
import { formatMoney, parseMoney } from '@shared/domain/money';
import { CreditCardPurchaseEntity } from '../../../domain/entities/credit-card-purchase.entity';
import { CreditCardInstallmentOrmEntity } from '../entities/credit-card-installment.orm-entity';
import { CreditCardPurchaseOrmEntity } from '../entities/credit-card-purchase.orm-entity';
import { CreditCardInvoiceMapper } from './credit-card-invoice.mapper';
import { CreditCardMapper } from './credit-card.mapper';

function required<T>(value: T | undefined, relation: string): T {
  if (value === undefined) {
    throw new Error(`Purchase ${relation} relation must be loaded`);
  }

  return value;
}

export class CreditCardPurchaseMapper {
  static toDomain(orm: CreditCardPurchaseOrmEntity): CreditCardPurchaseEntity {
    const card = CreditCardMapper.toDomain(required(orm.creditCard, 'card'));

    return CreditCardPurchaseEntity.reconstitute({
      id: orm.id,
      uuid: orm.uuid,
      status: orm.status,
      ownerId: orm.userId,
      card,
      category: TransactionCategoryMapper.toDomain(
        required(orm.category, 'category'),
      ),
      description: orm.description,
      amount: parseMoney(orm.amount),
      purchaseDate: orm.purchaseDate,
      notes: orm.notes,
      installments: required(orm.installments, 'installments').map(
        (installment) => ({
          number: installment.number,
          amount: parseMoney(installment.amount),
          date: installment.date,
          invoice: CreditCardInvoiceMapper.toDomain(
            required(installment.invoice, 'installment invoice'),
            card,
          ),
        }),
      ),
      refunds: required(orm.refunds, 'refunds')
        .filter((refund) => refund.deletedAt === null)
        .map((refund) => ({
          uuid: refund.uuid,
          amount: parseMoney(refund.amount),
          date: refund.date,
          invoice: CreditCardInvoiceMapper.toDomain(
            required(refund.invoice, 'refund invoice'),
            card,
          ),
        })),
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
      deletedAt: orm.deletedAt,
    });
  }

  static toOrm(domain: CreditCardPurchaseEntity): CreditCardPurchaseOrmEntity {
    const orm = new CreditCardPurchaseOrmEntity();

    if (domain.id > 0) {
      orm.id = domain.id;
      orm.updatedAt = domain.updatedAt;
    } else {
      orm.installments = domain.installments.map((installment) => {
        const row = new CreditCardInstallmentOrmEntity();

        row.userId = domain.ownerId;
        row.invoiceId = installment.invoice.id;
        row.number = installment.number;
        row.amount = formatMoney(installment.amount);
        row.date = installment.date;

        return row;
      });
    }

    orm.uuid = domain.uuid;
    orm.status = domain.status;
    orm.userId = domain.ownerId;
    orm.creditCardId = domain.card.id;
    orm.categoryId = domain.category.id;
    orm.description = domain.description;
    orm.amount = formatMoney(domain.amount);
    orm.purchaseDate = domain.purchaseDate;
    orm.notes = domain.notes;
    orm.deletedAt = domain.deletedAt;

    return orm;
  }
}
