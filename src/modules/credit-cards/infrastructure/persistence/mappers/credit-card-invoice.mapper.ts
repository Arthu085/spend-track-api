import { CreditCardInvoiceEntity } from '../../../domain/entities/credit-card-invoice.entity';
import type { CreditCardEntity } from '../../../domain/entities/credit-card.entity';
import { CreditCardInvoiceOrmEntity } from '../entities/credit-card-invoice.orm-entity';
import { CreditCardMapper } from './credit-card.mapper';

export class CreditCardInvoiceMapper {
  static toDomain(
    orm: CreditCardInvoiceOrmEntity,
    card?: CreditCardEntity,
  ): CreditCardInvoiceEntity {
    return CreditCardInvoiceEntity.reconstitute({
      id: orm.id,
      uuid: orm.uuid,
      card: card ?? CreditCardInvoiceMapper.cardOf(orm),
      referenceMonth: orm.referenceMonth,
      closingDate: orm.closingDate,
      dueDate: orm.dueDate,
      createdAt: orm.createdAt,
    });
  }

  static toOrm(domain: CreditCardInvoiceEntity): CreditCardInvoiceOrmEntity {
    const orm = new CreditCardInvoiceOrmEntity();

    if (domain.id > 0) {
      orm.id = domain.id;
    }

    orm.uuid = domain.uuid;
    orm.userId = domain.ownerId;
    orm.creditCardId = domain.card.id;
    orm.referenceMonth = domain.referenceMonth;
    orm.closingDate = domain.closingDate;
    orm.dueDate = domain.dueDate;

    return orm;
  }

  private static cardOf(orm: CreditCardInvoiceOrmEntity): CreditCardEntity {
    if (!orm.creditCard) {
      throw new Error('Invoice credit card relation must be loaded');
    }

    return CreditCardMapper.toDomain(orm.creditCard);
  }
}
