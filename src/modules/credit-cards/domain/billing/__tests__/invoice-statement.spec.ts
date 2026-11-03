import {
  buildCreditCard,
  buildCreditCardInvoice,
} from '@test/support/builders/credit-card.builder';
import { CreditCardInvoiceStatus } from '../../enums/credit-card-invoice-status.enum';
import {
  buildInvoiceStatements,
  cardBalanceOf,
  type InvoiceTotals,
} from '../invoice-statement';

const visa = buildCreditCard({ id: 1 });
const master = buildCreditCard({ id: 2, uuid: 'master' });

function totals(
  referenceMonth: string,
  amounts: Partial<Omit<InvoiceTotals, 'invoice'>>,
  card = visa,
): InvoiceTotals {
  const month = referenceMonth.slice(0, 8);

  return {
    invoice: buildCreditCardInvoice({
      uuid: `${card.uuid}-${referenceMonth}`,
      card,
      referenceMonth,
      closingDate: `${month}05`,
      dueDate: `${month}12`,
    }),
    charges: 0,
    credits: 0,
    paid: 0,
    ...amounts,
  };
}

describe('buildInvoiceStatements', () => {
  it('derives the status from the closing and due dates and the outstanding amount', () => {
    const statements = buildInvoiceStatements(
      [
        totals('2026-08-01', { charges: 10000, paid: 10000 }),
        totals('2026-09-01', { charges: 10000, paid: 4000 }),
        totals('2026-10-01', { charges: 5000 }),
        totals('2026-11-01', { charges: 7000 }),
      ],
      '2026-10-29',
    );

    expect(
      statements.map(({ status, outstanding }) => [status, outstanding]),
    ).toEqual([
      [CreditCardInvoiceStatus.PAID, 0],
      [CreditCardInvoiceStatus.OVERDUE, 6000],
      [CreditCardInvoiceStatus.OVERDUE, 5000],
      [CreditCardInvoiceStatus.OPEN, 7000],
    ]);
  });

  it('reports a closed invoice before its due date as CLOSED', () => {
    const [statement] = buildInvoiceStatements(
      [totals('2026-11-01', { charges: 100 })],
      '2026-11-06',
    );

    expect(statement.status).toBe(CreditCardInvoiceStatus.CLOSED);
  });

  it('carries a credit to the next invoice of the same card only', () => {
    const statements = buildInvoiceStatements(
      [
        totals('2026-11-01', { charges: 30000 }),
        totals('2026-10-01', { charges: 10000, credits: 5000, paid: 10000 }),
        totals('2026-10-01', { charges: 2000 }, master),
      ],
      '2026-10-29',
    );

    expect(
      statements.map((statement) => ({
        uuid: statement.invoice.uuid,
        previousCredit: statement.previousCredit,
        total: statement.total,
        outstanding: statement.outstanding,
        creditCarried: statement.creditCarried,
      })),
    ).toEqual([
      {
        uuid: 'card-uuid-2026-10-01',
        previousCredit: 0,
        total: 5000,
        outstanding: 0,
        creditCarried: 5000,
      },
      {
        uuid: 'card-uuid-2026-11-01',
        previousCredit: 5000,
        total: 25000,
        outstanding: 25000,
        creditCarried: 0,
      },
      {
        uuid: 'master-2026-10-01',
        previousCredit: 0,
        total: 2000,
        outstanding: 2000,
        creditCarried: 0,
      },
    ]);
  });

  it('sums a card balance and keeps the credit left after its latest invoice', () => {
    const statements = buildInvoiceStatements(
      [
        totals('2026-10-01', { charges: 10000 }),
        totals('2026-11-01', { charges: 1000, credits: 3000 }),
      ],
      '2026-10-29',
    );

    expect(cardBalanceOf(statements)).toEqual({
      outstanding: 10000,
      creditBalance: 2000,
    });
    expect(cardBalanceOf([])).toEqual({ outstanding: 0, creditBalance: 0 });
  });
});
