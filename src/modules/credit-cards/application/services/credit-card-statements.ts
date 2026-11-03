import { Inject, Injectable } from '@nestjs/common';
import { financeToday } from '@shared/domain/calendar';
import {
  buildInvoiceStatements,
  cardBalanceOf,
  type CardBalance,
  type InvoiceStatement,
} from '../../domain/billing/invoice-statement';
import type { CreditCardInvoiceEntity } from '../../domain/entities/credit-card-invoice.entity';
import type { CreditCardEntity } from '../../domain/entities/credit-card.entity';
import {
  CREDIT_CARD_INVOICE_REPOSITORY,
  type CreditCardInvoiceRepository,
} from '../../domain/repositories/credit-card-invoice.repository';

export interface CreditCardWithBalance {
  card: CreditCardEntity;
  balance: CardBalance;
}

@Injectable()
export class CreditCardStatements {
  constructor(
    @Inject(CREDIT_CARD_INVOICE_REPOSITORY)
    private readonly invoiceRepository: CreditCardInvoiceRepository,
  ) {}

  async forOwner(
    ownerId: number,
    cardIds?: readonly number[],
  ): Promise<InvoiceStatement[]> {
    if (cardIds?.length === 0) {
      return [];
    }

    return buildInvoiceStatements(
      await this.invoiceRepository.findTotals(ownerId, { cardIds }),
      financeToday(),
    );
  }

  async ofInvoice(invoice: CreditCardInvoiceEntity): Promise<InvoiceStatement> {
    const statements = await this.forOwner(invoice.ownerId, [invoice.card.id]);

    const statement = statements.find(
      (candidate) => candidate.invoice.id === invoice.id,
    );

    if (!statement) {
      throw new Error('Invoice statement must exist for a stored invoice');
    }

    return statement;
  }

  async withBalances(
    cards: readonly CreditCardEntity[],
  ): Promise<CreditCardWithBalance[]> {
    if (cards.length === 0) {
      return [];
    }

    const statements = await this.forOwner(
      cards[0].ownerId,
      cards.map((card) => card.id),
    );

    return cards.map((card) => ({
      card,
      balance: cardBalanceOf(
        statements.filter((statement) => statement.invoice.card.id === card.id),
      ),
    }));
  }

  async withBalance(card: CreditCardEntity): Promise<CreditCardWithBalance> {
    const [withBalance] = await this.withBalances([card]);

    return withBalance;
  }
}
