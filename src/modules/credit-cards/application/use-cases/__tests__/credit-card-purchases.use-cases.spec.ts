import {
  InactiveTransactionCategoryError,
  TransactionCategoryKind,
  type TransactionCategoryRepository,
} from '@modules/transaction-categories';
import type { TransactionManagerPort } from '@shared/application/ports';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import {
  buildCreditCard,
  buildCreditCardInvoice,
  buildCreditCardPurchase,
  buildCreditCardRefund,
} from '@test/support/builders/credit-card.builder';
import { buildTransactionCategory } from '@test/support/builders/transaction-category.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import type { CreditCardPurchaseEntity } from '../../../domain/entities/credit-card-purchase.entity';
import type { CreditCardRefundEntity } from '../../../domain/entities/credit-card-refund.entity';
import { CreditCardInstallmentsExceedAmountError } from '../../../domain/errors/credit-card-installments-exceed-amount.error';
import { CreditCardPurchaseCategoryKindError } from '../../../domain/errors/credit-card-purchase-category-kind.error';
import { CreditCardPurchaseNotDeletableError } from '../../../domain/errors/credit-card-purchase-not-deletable.error';
import { CreditCardPurchaseNotFoundError } from '../../../domain/errors/credit-card-purchase-not-found.error';
import { CreditCardRefundExceedsPurchaseError } from '../../../domain/errors/credit-card-refund-exceeds-purchase.error';
import { CreditCardRefundNotDeletableError } from '../../../domain/errors/credit-card-refund-not-deletable.error';
import { CreditCardRefundNotFoundError } from '../../../domain/errors/credit-card-refund-not-found.error';
import { CreditCardNotFoundError } from '../../../domain/errors/credit-card-not-found.error';
import { InactiveCreditCardError } from '../../../domain/errors/inactive-credit-card.error';
import type { CreditCardPurchaseRepository } from '../../../domain/repositories/credit-card-purchase.repository';
import type { CreditCardRefundRepository } from '../../../domain/repositories/credit-card-refund.repository';
import type { CreditCardRepository } from '../../../domain/repositories/credit-card.repository';
import type { CreditCardInvoiceAssigner } from '../../services/credit-card-invoice-assigner';
import { CreateCreditCardPurchaseUseCase } from '../create-credit-card-purchase.use-case';
import { CreateCreditCardRefundUseCase } from '../create-credit-card-refund.use-case';
import { DeleteCreditCardPurchaseUseCase } from '../delete-credit-card-purchase.use-case';
import { DeleteCreditCardRefundUseCase } from '../delete-credit-card-refund.use-case';
import { GetCreditCardPurchaseUseCase } from '../get-credit-card-purchase.use-case';
import { ListCreditCardPurchasesUseCase } from '../list-credit-card-purchases.use-case';
import { UpdateCreditCardPurchaseUseCase } from '../update-credit-card-purchase.use-case';

const transactionManager: TransactionManagerPort = {
  runInTransaction: <T>(work: () => Promise<T>): Promise<T> => work(),
  runInSavepoint: <T>(work: () => Promise<T>): Promise<T> => work(),
};

const card = buildCreditCard({ id: 4 });

const openInvoice = (month: number) =>
  buildCreditCardInvoice({
    id: month,
    uuid: `invoice-${month}`,
    card,
    referenceMonth: `2026-${String(month).padStart(2, '0')}-01`,
    closingDate: `2026-${String(month).padStart(2, '0')}-05`,
  });

function setup(
  found: CreditCardPurchaseEntity | null = buildCreditCardPurchase(),
) {
  const calls: string[] = [];

  const purchases = {
    findAllPaginatedByOwner: jest
      .fn()
      .mockResolvedValue({ items: [buildCreditCardPurchase()], total: 5 }),
    findByUuidForOwner: jest.fn().mockResolvedValue(found),
    create: jest.fn((purchase: CreditCardPurchaseEntity) =>
      Promise.resolve(purchase),
    ),
    update: jest.fn((purchase: CreditCardPurchaseEntity) =>
      Promise.resolve(purchase),
    ),
    softDelete: jest.fn().mockResolvedValue(undefined),
  };

  const cardsByUuid = new Map([
    ['card', card],
    ['archived', buildCreditCard({ status: RecordStatus.INACTIVE })],
  ]);

  const cards = mockOf<CreditCardRepository>({
    lockOwnerCards: jest.fn(() => {
      calls.push('lock-cards');
      return Promise.resolve();
    }),
    findByUuidForOwner: jest.fn((uuid: string) =>
      Promise.resolve(cardsByUuid.get(uuid) ?? null),
    ),
  });

  const categoriesByUuid = new Map([
    ['shopping', buildTransactionCategory({ id: 9, uuid: 'shopping' })],
    [
      'salary',
      buildTransactionCategory({
        uuid: 'salary',
        kind: TransactionCategoryKind.INCOME,
      }),
    ],
    ['inactive', buildTransactionCategory({ status: RecordStatus.INACTIVE })],
  ]);

  const categories = mockOf<TransactionCategoryRepository>({
    findVisibleByUuid: jest.fn((uuid: string) =>
      Promise.resolve(categoriesByUuid.get(uuid) ?? null),
    ),
  });

  const invoicesFrom = jest.fn((_card: unknown, _date: string, count: number) =>
    Promise.resolve(
      Array.from({ length: count }, (_, index) => openInvoice(11 + index)),
    ),
  );

  const refunds = {
    findByUuidForPurchase: jest.fn().mockResolvedValue(buildCreditCardRefund()),
    create: jest.fn((refund: CreditCardRefundEntity) =>
      Promise.resolve(refund),
    ),
    softDelete: jest.fn().mockResolvedValue(undefined),
  };

  return {
    calls,
    purchases,
    refunds,
    invoicesFrom,
    purchasePort: mockOf<CreditCardPurchaseRepository>(purchases),
    refundPort: mockOf<CreditCardRefundRepository>(refunds),
    cards,
    categories,
    assigner: mockOf<CreditCardInvoiceAssigner>({ invoicesFrom }),
  };
}

describe('credit card purchase use-cases', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-29T15:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function createUseCase(context: ReturnType<typeof setup>) {
    return new CreateCreditCardPurchaseUseCase(
      context.purchasePort,
      context.cards,
      context.categories,
      transactionManager,
      context.assigner,
    );
  }

  const purchaseInput = {
    ownerId: 1,
    cardUuid: 'card',
    categoryUuid: 'shopping',
    description: 'TV',
    amount: 100000,
    purchaseDate: '2026-10-31',
    installmentCount: 3,
  };

  it('splits a purchase into installments billed on consecutive invoices', async () => {
    const context = setup();

    const purchase = await createUseCase(context).execute(purchaseInput);

    expect(context.calls).toEqual(['lock-cards']);
    expect(context.invoicesFrom).toHaveBeenCalledWith(card, '2026-10-31', 3);
    expect(
      purchase.installments.map(({ number, amount, date, invoice }) => [
        number,
        amount,
        date,
        invoice.uuid,
      ]),
    ).toEqual([
      [1, 33334, '2026-10-31', 'invoice-11'],
      [2, 33333, '2026-11-30', 'invoice-12'],
      [3, 33333, '2026-12-31', 'invoice-13'],
    ]);
    expect(purchase.notes).toBeNull();
  });

  it('records a planned charge on an archived card, but not on a missing one', async () => {
    const context = setup();
    const useCase = createUseCase(context);

    const purchase = await useCase.recordPlannedCharge({
      ...purchaseInput,
      cardUuid: 'archived',
    });

    expect(purchase.card.status).toBe(RecordStatus.INACTIVE);
    await expect(
      useCase.recordPlannedCharge({ ...purchaseInput, cardUuid: 'missing' }),
    ).rejects.toThrow(CreditCardNotFoundError);
  });

  it('refuses an archived card, a non-expense or inactive category, and too many installments', async () => {
    const useCase = createUseCase(setup());

    await expect(
      useCase.execute({ ...purchaseInput, cardUuid: 'archived' }),
    ).rejects.toThrow(InactiveCreditCardError);
    await expect(
      useCase.execute({ ...purchaseInput, categoryUuid: 'salary' }),
    ).rejects.toThrow(CreditCardPurchaseCategoryKindError);
    await expect(
      useCase.execute({ ...purchaseInput, categoryUuid: 'inactive' }),
    ).rejects.toThrow(InactiveTransactionCategoryError);
    await expect(
      useCase.execute({ ...purchaseInput, amount: 2 }),
    ).rejects.toThrow(CreditCardInstallmentsExceedAmountError);
  });

  it('lists and gets purchases of the owner', async () => {
    const context = setup();

    const page = await new ListCreditCardPurchasesUseCase(
      context.purchasePort,
    ).execute({
      ownerId: 1,
      page: 1,
      limit: 20,
      cardUuid: 'card',
      description: ' tv ',
    });

    expect(context.purchases.findAllPaginatedByOwner).toHaveBeenCalledWith(
      1,
      0,
      20,
      expect.objectContaining({ cardUuid: 'card', description: 'tv' }),
    );
    expect(page.total).toBe(5);

    await expect(
      new GetCreditCardPurchaseUseCase(context.purchasePort).execute('x', 1),
    ).resolves.toBeDefined();

    context.purchases.findByUuidForOwner.mockResolvedValue(null);
    await expect(
      new GetCreditCardPurchaseUseCase(context.purchasePort).execute('x', 2),
    ).rejects.toThrow(CreditCardPurchaseNotFoundError);
  });

  it('updates description, category, and notes', async () => {
    const context = setup();

    const useCase = new UpdateCreditCardPurchaseUseCase(
      context.purchasePort,
      context.cards,
      context.categories,
      transactionManager,
    );

    const updated = await useCase.execute({
      uuid: 'purchase-uuid',
      ownerId: 1,
      description: 'Boots',
      categoryUuid: 'shopping',
      notes: null,
    });

    expect(updated).toMatchObject({ description: 'Boots', notes: null });
    expect(updated.category.uuid).toBe('shopping');

    const unchanged = await useCase.execute({
      uuid: 'purchase-uuid',
      ownerId: 1,
    });

    expect(unchanged.description).toBe('Shoes');
  });

  it('deletes an unbilled purchase and keeps a billed one', async () => {
    const context = setup();

    const useCase = new DeleteCreditCardPurchaseUseCase(
      context.purchasePort,
      context.cards,
      transactionManager,
    );

    await useCase.execute({ uuid: 'purchase-uuid', ownerId: 1 });
    expect(context.purchases.softDelete).toHaveBeenCalled();

    context.purchases.findByUuidForOwner.mockResolvedValue(
      buildCreditCardPurchase({
        installments: [
          {
            number: 1,
            amount: 30000,
            date: '2026-09-29',
            invoice: openInvoice(10),
          },
        ],
      }),
    );
    await expect(
      useCase.execute({ uuid: 'purchase-uuid', ownerId: 1 }),
    ).rejects.toThrow(CreditCardPurchaseNotDeletableError);
  });

  it('credits a refund on the invoice of its date, within the refundable amount', async () => {
    const context = setup();

    const useCase = new CreateCreditCardRefundUseCase(
      context.purchasePort,
      context.refundPort,
      context.cards,
      transactionManager,
      context.assigner,
    );

    const refund = await useCase.execute({
      purchaseUuid: 'purchase-uuid',
      ownerId: 1,
      amount: 10000,
      date: '2026-11-02',
    });

    expect(context.invoicesFrom).toHaveBeenCalledWith(
      expect.anything(),
      '2026-11-02',
      1,
    );
    expect(refund).toMatchObject({ amount: 10000, notes: null });
    expect(refund.invoice.uuid).toBe('invoice-11');

    await expect(
      useCase.execute({
        purchaseUuid: 'purchase-uuid',
        ownerId: 1,
        amount: 30001,
        date: '2026-11-02',
      }),
    ).rejects.toThrow(CreditCardRefundExceedsPurchaseError);
  });

  it('deletes a refund while its invoice is open only', async () => {
    const context = setup();

    const useCase = new DeleteCreditCardRefundUseCase(
      context.purchasePort,
      context.refundPort,
      context.cards,
      transactionManager,
    );

    const input = {
      purchaseUuid: 'purchase-uuid',
      refundUuid: 'refund-uuid',
      ownerId: 1,
    };

    await useCase.execute(input);
    expect(context.refunds.softDelete).toHaveBeenCalled();

    context.refunds.findByUuidForPurchase.mockResolvedValue(
      buildCreditCardRefund({ invoice: openInvoice(10) }),
    );
    await expect(useCase.execute(input)).rejects.toThrow(
      CreditCardRefundNotDeletableError,
    );

    context.refunds.findByUuidForPurchase.mockResolvedValue(null);
    await expect(useCase.execute(input)).rejects.toThrow(
      CreditCardRefundNotFoundError,
    );
  });
});
