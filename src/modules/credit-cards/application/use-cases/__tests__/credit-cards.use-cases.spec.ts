import {
  AccountNotFoundError,
  InactiveAccountError,
  type AccountRepository,
} from '@modules/accounts';
import type { TransactionManagerPort } from '@shared/application/ports';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { buildAccount } from '@test/support/builders/account.builder';
import {
  buildCreditCard,
  buildCreditCardInvoice,
  buildCreditCardPayment,
  buildInvoiceStatement,
} from '@test/support/builders/credit-card.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import type { CreditCardPaymentEntity } from '../../../domain/entities/credit-card-payment.entity';
import type { CreditCardEntity } from '../../../domain/entities/credit-card.entity';
import { CreditCardHasHistoryError } from '../../../domain/errors/credit-card-has-history.error';
import { CreditCardInvoiceNotFoundError } from '../../../domain/errors/credit-card-invoice-not-found.error';
import { CreditCardNotFoundError } from '../../../domain/errors/credit-card-not-found.error';
import { CreditCardPaymentExceedsOutstandingError } from '../../../domain/errors/credit-card-payment-exceeds-outstanding.error';
import { CreditCardPaymentNotFoundError } from '../../../domain/errors/credit-card-payment-not-found.error';
import { InactiveCreditCardError } from '../../../domain/errors/inactive-credit-card.error';
import type { CreditCardInvoiceRepository } from '../../../domain/repositories/credit-card-invoice.repository';
import type { CreditCardPaymentRepository } from '../../../domain/repositories/credit-card-payment.repository';
import type { CreditCardRepository } from '../../../domain/repositories/credit-card.repository';
import type { CreditCardStatements } from '../../services/credit-card-statements';
import { CancelCreditCardPaymentUseCase } from '../cancel-credit-card-payment.use-case';
import { CreateCreditCardUseCase } from '../create-credit-card.use-case';
import { DeleteCreditCardUseCase } from '../delete-credit-card.use-case';
import { GetCreditCardInvoiceUseCase } from '../get-credit-card-invoice.use-case';
import { GetCreditCardUseCase } from '../get-credit-card.use-case';
import { ListCreditCardInvoicesUseCase } from '../list-credit-card-invoices.use-case';
import { ListCreditCardsUseCase } from '../list-credit-cards.use-case';
import { PayCreditCardInvoiceUseCase } from '../pay-credit-card-invoice.use-case';
import { UpdateCreditCardStatusUseCase } from '../update-credit-card-status.use-case';
import { UpdateCreditCardUseCase } from '../update-credit-card.use-case';

const transactionManager: TransactionManagerPort = {
  runInTransaction: <T>(work: () => Promise<T>): Promise<T> => work(),
  runInSavepoint: <T>(work: () => Promise<T>): Promise<T> => work(),
};

const BALANCE = { outstanding: 0, creditBalance: 0 };

function setup(found: CreditCardEntity | null = buildCreditCard()) {
  const calls: string[] = [];

  const cards = {
    findAllPaginatedByOwner: jest
      .fn()
      .mockResolvedValue({ items: [buildCreditCard()], total: 3 }),
    findByUuidForOwner: jest.fn().mockResolvedValue(found),
    hasPurchases: jest.fn().mockResolvedValue(false),
    lockOwnerCards: jest.fn(() => {
      calls.push('lock-cards');
      return Promise.resolve();
    }),
    clearDefault: jest.fn(() => {
      calls.push('clear-default');
      return Promise.resolve();
    }),
    create: jest.fn((card: CreditCardEntity) => Promise.resolve(card)),
    update: jest.fn((card: CreditCardEntity) => Promise.resolve(card)),
    softDelete: jest.fn().mockResolvedValue(undefined),
  };

  const statements = {
    forOwner: jest
      .fn()
      .mockResolvedValue([
        buildInvoiceStatement({ outstanding: 1 }),
        buildInvoiceStatement({ outstanding: 2 }),
        buildInvoiceStatement({ outstanding: 3 }),
      ]),
    ofInvoice: jest
      .fn()
      .mockResolvedValue(buildInvoiceStatement({ outstanding: 30000 })),
    withBalances: jest.fn((list: CreditCardEntity[]) =>
      Promise.resolve(list.map((card) => ({ card, balance: BALANCE }))),
    ),
    withBalance: jest.fn((card: CreditCardEntity) =>
      Promise.resolve({ card, balance: BALANCE }),
    ),
  };

  return {
    calls,
    cards,
    statements,
    cardPort: mockOf<CreditCardRepository>(cards),
    statementsPort: mockOf<CreditCardStatements>(statements),
  };
}

describe('credit card use-cases', () => {
  it('lists active cards by default with their balances', async () => {
    const { cards, cardPort, statementsPort } = setup();

    const result = await new ListCreditCardsUseCase(
      cardPort,
      statementsPort,
    ).execute({ ownerId: 1, page: 2, limit: 10, name: '  visa ' });

    expect(cards.findAllPaginatedByOwner).toHaveBeenCalledWith(1, 10, 10, {
      name: 'visa',
      status: RecordStatus.ACTIVE,
    });
    expect(result.total).toBe(3);
    expect(result.items[0].balance).toBe(BALANCE);
  });

  it('gets an active card and rejects an archived or foreign one', async () => {
    const active = setup();

    await expect(
      new GetCreditCardUseCase(active.cardPort, active.statementsPort).execute(
        'card-uuid',
        1,
      ),
    ).resolves.toMatchObject({ balance: BALANCE });

    const archived = setup(buildCreditCard({ status: RecordStatus.INACTIVE }));

    await expect(
      new GetCreditCardUseCase(
        archived.cardPort,
        archived.statementsPort,
      ).execute('card-uuid', 1),
    ).rejects.toThrow(InactiveCreditCardError);

    const foreign = setup(null);

    await expect(
      new GetCreditCardUseCase(
        foreign.cardPort,
        foreign.statementsPort,
      ).execute('card-uuid', 2),
    ).rejects.toThrow(CreditCardNotFoundError);
  });

  it('creates a default card after clearing the previous default under the lock', async () => {
    const { calls, cards, cardPort, statementsPort } = setup();

    const result = await new CreateCreditCardUseCase(
      cardPort,
      transactionManager,
      statementsPort,
    ).execute({
      ownerId: 1,
      name: 'Visa',
      creditLimit: 1000,
      closingDay: 5,
      dueDay: 12,
      isDefault: true,
    });

    expect(calls).toEqual(['lock-cards', 'clear-default']);
    expect(cards.create).toHaveBeenCalled();
    expect(result.card).toMatchObject({ name: 'Visa', isDefault: true });
  });

  it('updates a card partially and switches the default', async () => {
    const { calls, cardPort, statementsPort } = setup();

    const result = await new UpdateCreditCardUseCase(
      cardPort,
      transactionManager,
      statementsPort,
    ).execute({ uuid: 'card-uuid', ownerId: 1, dueDay: 20, isDefault: true });

    expect(calls).toEqual(['lock-cards', 'clear-default']);
    expect(result.card).toMatchObject({
      name: 'Visa',
      closingDay: 5,
      dueDay: 20,
      isDefault: true,
    });
  });

  it('refuses to update an archived card', async () => {
    const { cardPort, statementsPort } = setup(
      buildCreditCard({ status: RecordStatus.INACTIVE }),
    );

    await expect(
      new UpdateCreditCardUseCase(
        cardPort,
        transactionManager,
        statementsPort,
      ).execute({ uuid: 'card-uuid', ownerId: 1, name: 'x' }),
    ).rejects.toThrow(InactiveCreditCardError);
  });

  it('archives a card', async () => {
    const { cardPort, statementsPort } = setup(
      buildCreditCard({ isDefault: true }),
    );

    const result = await new UpdateCreditCardStatusUseCase(
      cardPort,
      transactionManager,
      statementsPort,
    ).execute({ uuid: 'card-uuid', ownerId: 1, status: RecordStatus.INACTIVE });

    expect(result.card).toMatchObject({
      status: RecordStatus.INACTIVE,
      isDefault: false,
    });
  });

  it('deletes a card without purchases and keeps one with history', async () => {
    const { cards, cardPort } = setup();
    const useCase = new DeleteCreditCardUseCase(cardPort, transactionManager);

    await useCase.execute({ uuid: 'card-uuid', ownerId: 1 });
    expect(cards.softDelete).toHaveBeenCalled();

    cards.hasPurchases.mockResolvedValue(true);
    await expect(
      useCase.execute({ uuid: 'card-uuid', ownerId: 1 }),
    ).rejects.toThrow(CreditCardHasHistoryError);
  });

  it('pages the invoices of a card, newest first', async () => {
    const { cardPort, statementsPort, statements } = setup();

    const result = await new ListCreditCardInvoicesUseCase(
      cardPort,
      statementsPort,
    ).execute({ cardUuid: 'card-uuid', ownerId: 1, page: 1, limit: 2 });

    expect(statements.forOwner).toHaveBeenCalledWith(1, [1]);
    expect(result.items.map(({ outstanding }) => outstanding)).toEqual([3, 2]);
    expect(result.total).toBe(3);
  });
});

describe('invoice use-cases', () => {
  const invoice = buildCreditCardInvoice();

  function invoiceSetup(foundInvoice = invoice) {
    const base = setup();
    const calls = base.calls;

    const invoices = {
      findByUuidForOwner: jest.fn().mockResolvedValue(foundInvoice),
      findEntries: jest
        .fn()
        .mockResolvedValue({ charges: [], refunds: [], payments: [] }),
    };

    const payments = {
      findByUuidForInvoice: jest
        .fn()
        .mockResolvedValue(buildCreditCardPayment()),
      create: jest.fn((payment: CreditCardPaymentEntity) =>
        Promise.resolve(payment),
      ),
      update: jest.fn((payment: CreditCardPaymentEntity) =>
        Promise.resolve(payment),
      ),
    };

    const accountsByUuid = new Map([
      ['bank', buildAccount({ uuid: 'bank' })],
      ['closed', buildAccount({ status: RecordStatus.INACTIVE })],
    ]);

    const accounts = mockOf<AccountRepository>({
      lockOwnerAccounts: jest.fn(() => {
        calls.push('lock-accounts');
        return Promise.resolve();
      }),
      findByUuidForOwner: jest.fn((uuid: string) =>
        Promise.resolve(accountsByUuid.get(uuid) ?? null),
      ),
    });

    return {
      ...base,
      invoices,
      payments,
      invoicePort: mockOf<CreditCardInvoiceRepository>(invoices),
      paymentPort: mockOf<CreditCardPaymentRepository>(payments),
      accounts,
    };
  }

  it('returns the statement with the entries of an owned invoice', async () => {
    const { invoicePort, statementsPort } = invoiceSetup();

    const detail = await new GetCreditCardInvoiceUseCase(
      invoicePort,
      statementsPort,
    ).execute('invoice-uuid', 1);

    expect(detail.statement.outstanding).toBe(30000);
    expect(detail.entries).toEqual({ charges: [], refunds: [], payments: [] });
  });

  it('answers 404 for a foreign invoice', async () => {
    const { invoices, invoicePort, statementsPort } = invoiceSetup();

    invoices.findByUuidForOwner.mockResolvedValue(null);

    await expect(
      new GetCreditCardInvoiceUseCase(invoicePort, statementsPort).execute(
        'invoice-uuid',
        2,
      ),
    ).rejects.toThrow(CreditCardInvoiceNotFoundError);
  });

  function payUseCase(context: ReturnType<typeof invoiceSetup>) {
    return new PayCreditCardInvoiceUseCase(
      context.cardPort,
      context.invoicePort,
      context.paymentPort,
      context.accounts,
      transactionManager,
      context.statementsPort,
    );
  }

  it('pays up to the outstanding amount from an active account under both locks', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-10T15:00:00Z'));

    const context = invoiceSetup();

    const payment = await payUseCase(context).execute({
      invoiceUuid: 'invoice-uuid',
      ownerId: 1,
      accountUuid: 'bank',
      amount: 30000,
    });

    expect(context.calls).toEqual(['lock-accounts', 'lock-cards']);
    expect(payment).toMatchObject({ amount: 30000, paidOn: '2026-11-10' });

    jest.useRealTimers();
  });

  it('refuses an overpayment, an inactive account, and a foreign account', async () => {
    const context = invoiceSetup();
    const useCase = payUseCase(context);

    const pay = (accountUuid: string, amount: number) =>
      useCase.execute({
        invoiceUuid: 'invoice-uuid',
        ownerId: 1,
        accountUuid,
        amount,
        paidOn: '2026-11-10',
      });

    await expect(pay('bank', 30001)).rejects.toThrow(
      CreditCardPaymentExceedsOutstandingError,
    );
    await expect(pay('closed', 1)).rejects.toThrow(InactiveAccountError);
    await expect(pay('other', 1)).rejects.toThrow(AccountNotFoundError);
    expect(context.payments.create).not.toHaveBeenCalled();
  });

  it('cancels a payment of the invoice and answers 404 for an unknown one', async () => {
    const context = invoiceSetup();

    const useCase = new CancelCreditCardPaymentUseCase(
      context.cardPort,
      context.invoicePort,
      context.paymentPort,
      context.accounts,
      transactionManager,
    );

    const input = {
      invoiceUuid: 'invoice-uuid',
      paymentUuid: 'payment-uuid',
      ownerId: 1,
    };

    await expect(useCase.execute(input)).resolves.toMatchObject({
      canceledAt: expect.any(Date) as Date,
    });
    expect(context.payments.findByUuidForInvoice).toHaveBeenCalledWith(
      'payment-uuid',
      invoice.id,
    );

    context.payments.findByUuidForInvoice.mockResolvedValue(null);
    await expect(useCase.execute(input)).rejects.toThrow(
      CreditCardPaymentNotFoundError,
    );
  });
});
