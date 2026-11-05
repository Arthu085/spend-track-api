import { AccountMapper } from '@modules/accounts/persistence';
import { formatMoney, parseMoney } from '@shared/domain/money';
import { CreditCardPaymentEntity } from '../../../domain/entities/credit-card-payment.entity';
import { CreditCardPaymentOrmEntity } from '../entities/credit-card-payment.orm-entity';
import { CreditCardInvoiceMapper } from './credit-card-invoice.mapper';

export class CreditCardPaymentMapper {
  static toDomain(orm: CreditCardPaymentOrmEntity): CreditCardPaymentEntity {
    if (!orm.invoice || !orm.account) {
      throw new Error('Payment invoice and account relations must be loaded');
    }

    return CreditCardPaymentEntity.reconstitute({
      id: orm.id,
      uuid: orm.uuid,
      status: orm.status,
      ownerId: orm.userId,
      invoice: CreditCardInvoiceMapper.toDomain(orm.invoice),
      account: AccountMapper.toDomain(orm.account),
      amount: parseMoney(orm.amount),
      paidOn: orm.paidOn,
      source: orm.source,
      canceledAt: orm.canceledAt,
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
      deletedAt: orm.deletedAt,
    });
  }

  static toOrm(domain: CreditCardPaymentEntity): CreditCardPaymentOrmEntity {
    const orm = new CreditCardPaymentOrmEntity();

    if (domain.id > 0) {
      orm.id = domain.id;
      orm.updatedAt = domain.updatedAt;
    }

    orm.uuid = domain.uuid;
    orm.status = domain.status;
    orm.userId = domain.ownerId;
    orm.invoiceId = domain.invoice.id;
    orm.accountId = domain.account.id;
    orm.amount = formatMoney(domain.amount);
    orm.paidOn = domain.paidOn;
    orm.source = domain.source;
    orm.canceledAt = domain.canceledAt;
    orm.deletedAt = domain.deletedAt;

    return orm;
  }
}
