import { sumMoney } from '@shared/domain/money';
import type { CreditCardInvoiceEntity } from '../entities/credit-card-invoice.entity';
import { CreditCardInvoiceStatus } from '../enums/credit-card-invoice-status.enum';

export interface InvoiceTotals {
  invoice: CreditCardInvoiceEntity;
  charges: number;
  credits: number;
  paid: number;
}

export interface InvoiceStatement extends InvoiceTotals {
  previousCredit: number;
  total: number;
  outstanding: number;
  creditCarried: number;
  status: CreditCardInvoiceStatus;
}

export interface CardBalance {
  outstanding: number;
  creditBalance: number;
}

function statusOf(
  invoice: CreditCardInvoiceEntity,
  outstanding: number,
  today: string,
): CreditCardInvoiceStatus {
  if (!invoice.isClosedOn(today)) {
    return CreditCardInvoiceStatus.OPEN;
  }

  if (outstanding === 0) {
    return CreditCardInvoiceStatus.PAID;
  }

  return today > invoice.dueDate
    ? CreditCardInvoiceStatus.OVERDUE
    : CreditCardInvoiceStatus.CLOSED;
}

function chainOfCard(
  totals: readonly InvoiceTotals[],
  today: string,
): InvoiceStatement[] {
  let previousCredit = 0;

  return [...totals]
    .sort((left, right) =>
      left.invoice.referenceMonth.localeCompare(right.invoice.referenceMonth),
    )
    .map((entry) => {
      const total = entry.charges - entry.credits - previousCredit;
      const balance = total - entry.paid;
      const outstanding = Math.max(balance, 0);
      const creditCarried = Math.max(-balance, 0);

      const statement: InvoiceStatement = {
        ...entry,
        previousCredit,
        total,
        outstanding,
        creditCarried,
        status: statusOf(entry.invoice, outstanding, today),
      };

      previousCredit = creditCarried;

      return statement;
    });
}

export function buildInvoiceStatements(
  totals: readonly InvoiceTotals[],
  today: string,
): InvoiceStatement[] {
  const byCard = new Map<number, InvoiceTotals[]>();

  for (const entry of totals) {
    const cardId = entry.invoice.card.id;

    byCard.set(cardId, [...(byCard.get(cardId) ?? []), entry]);
  }

  return [...byCard.values()].flatMap((cardTotals) =>
    chainOfCard(cardTotals, today),
  );
}

export function cardBalanceOf(
  statements: readonly InvoiceStatement[],
): CardBalance {
  return {
    outstanding: sumMoney(statements.map(({ outstanding }) => outstanding)),
    creditBalance: statements.at(-1)?.creditCarried ?? 0,
  };
}
