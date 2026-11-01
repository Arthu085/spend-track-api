import type { AccountLedgerRegistry } from '@modules/accounts';
import {
  buildCreditCard,
  buildCreditCardInvoice,
} from '@test/support/builders/credit-card.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import type { CreditCardInvoiceEntity } from '../../../domain/entities/credit-card-invoice.entity';
import type { CreditCardInvoiceRepository } from '../../../domain/repositories/credit-card-invoice.repository';
import type { CreditCardPaymentRepository } from '../../../domain/repositories/credit-card-payment.repository';
import { CreditCardInvoiceAssigner } from '../credit-card-invoice-assigner';
import { CreditCardPaymentLedger } from '../credit-card-payment-ledger';
import { CreditCardStatements } from '../credit-card-statements';

describe('CreditCardInvoiceAssigner', () => {
  const card = buildCreditCard({ id: 4, closingDay: 5, dueDay: 12 });

  function setup(stored: CreditCardInvoiceEntity[] = []) {
    const create = jest.fn((invoice: CreditCardInvoiceEntity) =>
      Promise.resolve(invoice),
    );

    const repository = mockOf<CreditCardInvoiceRepository>({
      findByCardAndReferenceMonth: jest.fn((_: number, month: string) =>
        Promise.resolve(
          stored.find((invoice) => invoice.referenceMonth === month) ?? null,
        ),
      ),
      create,
    });

    return { assigner: new CreditCardInvoiceAssigner(repository), create };
  }

  it('creates consecutive invoices from the settings, across the year', async () => {
    const { assigner, create } = setup();

    const invoices = await assigner.invoicesFrom(card, '2026-11-20', 3);

    expect(
      invoices.map(({ referenceMonth, closingDate, dueDate }) => [
        referenceMonth,
        closingDate,
        dueDate,
      ]),
    ).toEqual([
      ['2026-12-01', '2026-12-05', '2026-12-12'],
      ['2027-01-01', '2027-01-05', '2027-01-12'],
      ['2027-02-01', '2027-02-05', '2027-02-12'],
    ]);
    expect(create).toHaveBeenCalledTimes(3);
  });

  it('reuses stored invoices and skips one that its snapshot already closed', async () => {
    const closedEarlier = buildCreditCardInvoice({
      uuid: 'stored-nov',
      card,
      referenceMonth: '2026-11-01',
      closingDate: '2026-10-20',
      dueDate: '2026-11-12',
    });

    const storedDec = buildCreditCardInvoice({
      uuid: 'stored-dec',
      card,
      referenceMonth: '2026-12-01',
      closingDate: '2026-12-05',
      dueDate: '2026-12-12',
    });

    const { assigner, create } = setup([closedEarlier, storedDec]);

    const invoices = await assigner.invoicesFrom(card, '2026-10-29', 1);

    expect(invoices.map(({ uuid }) => uuid)).toEqual(['stored-dec']);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('CreditCardStatements', () => {
  const visa = buildCreditCard({ id: 1 });
  const master = buildCreditCard({ id: 2, uuid: 'master' });

  function setup() {
    const findTotals = jest.fn().mockResolvedValue([
      {
        invoice: buildCreditCardInvoice({ id: 10, card: visa }),
        charges: 1000,
        credits: 0,
        paid: 0,
      },
    ]);

    return {
      findTotals,
      statements: new CreditCardStatements(
        mockOf<CreditCardInvoiceRepository>({ findTotals }),
      ),
    };
  }

  it('balances each card with its own invoices', async () => {
    const { statements, findTotals } = setup();

    const result = await statements.withBalances([visa, master]);

    expect(findTotals).toHaveBeenCalledWith(1, { cardIds: [1, 2] });
    expect(result.map(({ balance }) => balance.outstanding)).toEqual([1000, 0]);
  });

  it('skips the query without cards', async () => {
    const { statements, findTotals } = setup();

    await expect(statements.withBalances([])).resolves.toEqual([]);
    await expect(statements.forOwner(1, [])).resolves.toEqual([]);
    expect(findTotals).not.toHaveBeenCalled();
  });

  it('finds the statement of a stored invoice', async () => {
    const { statements } = setup();

    await expect(
      statements.ofInvoice(buildCreditCardInvoice({ id: 10, card: visa })),
    ).resolves.toMatchObject({ outstanding: 1000 });
    await expect(
      statements.ofInvoice(buildCreditCardInvoice({ id: 99, card: visa })),
    ).rejects.toThrow('Invoice statement must exist');
  });
});

describe('CreditCardPaymentLedger', () => {
  it('registers itself and takes completed payments out of their accounts', async () => {
    const register = jest.fn();

    const payments = mockOf<CreditCardPaymentRepository>({
      sumByAccount: jest.fn().mockResolvedValue(new Map([[3, 1500]])),
      existsForAccount: jest.fn().mockResolvedValue(true),
    });

    const ledger = new CreditCardPaymentLedger(
      payments,
      mockOf<AccountLedgerRegistry>({ register }),
    );

    ledger.onModuleInit();

    expect(register).toHaveBeenCalledWith(ledger);
    await expect(ledger.balanceChanges(1, [3])).resolves.toEqual(
      new Map([[3, -1500]]),
    );
    await expect(ledger.hasEntries(1, 3)).resolves.toBe(true);
  });
});
