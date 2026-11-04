import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import { AccountEntity } from '@modules/accounts/domain/entities/account.entity';
import { AccountType } from '@modules/accounts/domain/enums/account-type.enum';
import { AccountOrmEntity } from '@modules/accounts/infrastructure/persistence/entities/account.orm-entity';
import { TypeOrmAccountRepository } from '@modules/accounts/infrastructure/persistence/repositories/typeorm-account.repository';
import { SpendingPerspective } from '@modules/preferences';
import { TransactionCategoryEntity } from '@modules/transaction-categories/domain/entities/transaction-category.entity';
import { TransactionCategoryKind } from '@modules/transaction-categories/domain/enums/transaction-category-kind.enum';
import { TransactionCategoryOrmEntity } from '@modules/transaction-categories/infrastructure/persistence/entities/transaction-category.orm-entity';
import { TypeOrmTransactionCategoryRepository } from '@modules/transaction-categories/infrastructure/persistence/repositories/typeorm-transaction-category.repository';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';
import {
  addMonthsToDate,
  firstDayOf,
  lastDayOf,
} from '@shared/domain/calendar';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { CreditCardInvoiceAssigner } from '../../../../application/services/credit-card-invoice-assigner';
import { splitInstallments } from '../../../../domain/billing/split-installments';
import { CreditCardPaymentEntity } from '../../../../domain/entities/credit-card-payment.entity';
import { CreditCardPurchaseEntity } from '../../../../domain/entities/credit-card-purchase.entity';
import { CreditCardRefundEntity } from '../../../../domain/entities/credit-card-refund.entity';
import { CreditCardEntity } from '../../../../domain/entities/credit-card.entity';
import { CREDIT_CARD_INVOICE_REPOSITORY } from '../../../../domain/repositories/credit-card-invoice.repository';
import { CreditCardInstallmentOrmEntity } from '../../entities/credit-card-installment.orm-entity';
import { CreditCardInvoiceOrmEntity } from '../../entities/credit-card-invoice.orm-entity';
import { CreditCardPaymentOrmEntity } from '../../entities/credit-card-payment.orm-entity';
import { CreditCardPurchaseOrmEntity } from '../../entities/credit-card-purchase.orm-entity';
import { CreditCardRefundOrmEntity } from '../../entities/credit-card-refund.orm-entity';
import { CreditCardOrmEntity } from '../../entities/credit-card.orm-entity';
import { TypeOrmCreditCardInvoiceRepository } from '../typeorm-credit-card-invoice.repository';
import { TypeOrmCreditCardPaymentRepository } from '../typeorm-credit-card-payment.repository';
import { TypeOrmCreditCardPurchaseRepository } from '../typeorm-credit-card-purchase.repository';
import { TypeOrmCreditCardRefundRepository } from '../typeorm-credit-card-refund.repository';
import { TypeOrmCreditCardRepository } from '../typeorm-credit-card.repository';

describe('credit card repositories (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let cards: TypeOrmCreditCardRepository;
  let invoices: TypeOrmCreditCardInvoiceRepository;
  let purchases: TypeOrmCreditCardPurchaseRepository;
  let refunds: TypeOrmCreditCardRefundRepository;
  let payments: TypeOrmCreditCardPaymentRepository;
  let assigner: CreditCardInvoiceAssigner;
  let accounts: TypeOrmAccountRepository;
  let categories: TypeOrmTransactionCategoryRepository;
  let transactionManager: TransactionManagerPort;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        CoreConfigModule,
        DatabaseModule,
        TypeOrmModule.forFeature([
          CreditCardOrmEntity,
          CreditCardInvoiceOrmEntity,
          CreditCardPurchaseOrmEntity,
          CreditCardInstallmentOrmEntity,
          CreditCardRefundOrmEntity,
          CreditCardPaymentOrmEntity,
          AccountOrmEntity,
          TransactionCategoryOrmEntity,
          UserOrmEntity,
        ]),
      ],
      providers: [
        TypeOrmCreditCardRepository,
        TypeOrmCreditCardInvoiceRepository,
        TypeOrmCreditCardPurchaseRepository,
        TypeOrmCreditCardRefundRepository,
        TypeOrmCreditCardPaymentRepository,
        TypeOrmAccountRepository,
        TypeOrmTransactionCategoryRepository,
        {
          provide: CREDIT_CARD_INVOICE_REPOSITORY,
          useExisting: TypeOrmCreditCardInvoiceRepository,
        },
        CreditCardInvoiceAssigner,
      ],
    }).compile();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
    cards = moduleRef.get(TypeOrmCreditCardRepository);
    invoices = moduleRef.get(TypeOrmCreditCardInvoiceRepository);
    purchases = moduleRef.get(TypeOrmCreditCardPurchaseRepository);
    refunds = moduleRef.get(TypeOrmCreditCardRefundRepository);
    payments = moduleRef.get(TypeOrmCreditCardPaymentRepository);
    assigner = moduleRef.get(CreditCardInvoiceAssigner);
    accounts = moduleRef.get(TypeOrmAccountRepository);
    categories = moduleRef.get(TypeOrmTransactionCategoryRepository);
    transactionManager = moduleRef.get(TRANSACTION_MANAGER);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "credit_card_payments", "credit_card_refunds", "credit_card_installments", "credit_card_purchases", "credit_card_invoices", "credit_cards", "accounts", "users" RESTART IDENTITY CASCADE',
    );
    await dataSource.query(
      'DELETE FROM "transaction_categories" WHERE "user_id" IS NOT NULL',
    );
  });

  interface Fixture {
    ownerId: number;
    card: CreditCardEntity;
    bank: AccountEntity;
    groceries: TransactionCategoryEntity;
  }

  async function insertUser(): Promise<number> {
    const users = dataSource.getRepository(UserOrmEntity);

    const user = await users.save(
      users.create({
        name: 'Owner',
        email: `${randomUUID()}@example.com`,
        password: 'hash',
      }),
    );

    return user.id;
  }

  function createCard(
    ownerId: number,
    name = 'Visa',
    isDefault = false,
  ): Promise<CreditCardEntity> {
    return cards.create(
      CreditCardEntity.create({
        uuid: randomUUID(),
        ownerId,
        name,
        creditLimit: 500000,
        closingDay: 5,
        dueDay: 12,
        isDefault,
      }),
    );
  }

  async function fixture(): Promise<Fixture> {
    const ownerId = await insertUser();

    return {
      ownerId,
      card: await createCard(ownerId, 'Visa', true),
      bank: await accounts.create(
        AccountEntity.create({
          uuid: randomUUID(),
          ownerId,
          name: 'Bank',
          type: AccountType.CHECKING,
          openingBalance: 0,
          openingBalanceDate: '2026-10-01',
          isDefault: false,
        }),
      ),
      groceries: await categories.create(
        TransactionCategoryEntity.createPersonal({
          uuid: randomUUID(),
          ownerId,
          name: 'Groceries',
          kind: TransactionCategoryKind.EXPENSE,
          color: null,
        }),
      ),
    };
  }

  async function purchase(
    f: Fixture,
    amount: number,
    purchaseDate: string,
    count = 1,
    description = 'Market',
  ): Promise<CreditCardPurchaseEntity> {
    const targets = await assigner.invoicesFrom(f.card, purchaseDate, count);

    const amounts = splitInstallments(amount, count);

    return purchases.create(
      CreditCardPurchaseEntity.create({
        uuid: randomUUID(),
        ownerId: f.ownerId,
        card: f.card,
        category: f.groceries,
        description,
        amount,
        purchaseDate,
        notes: null,
        installments: targets.map((invoice, index) => ({
          number: index + 1,
          amount: amounts[index],
          date: addMonthsToDate(purchaseDate, index),
          invoice,
        })),
      }),
    );
  }

  async function refund(
    f: Fixture,
    of: CreditCardPurchaseEntity,
    amount: number,
    date: string,
  ): Promise<CreditCardRefundEntity> {
    const [invoice] = await assigner.invoicesFrom(f.card, date, 1);

    return refunds.create(
      CreditCardRefundEntity.create({
        uuid: randomUUID(),
        ownerId: f.ownerId,
        purchase: { id: of.id, uuid: of.uuid, description: of.description },
        invoice,
        amount,
        date,
        notes: null,
      }),
    );
  }

  it('stores a purchase with its installments on consecutive invoices', async () => {
    const f = await fixture();
    const created = await purchase(f, 10000, '2026-10-29', 3);

    const found = await purchases.findByUuidForOwner(created.uuid, f.ownerId);

    expect(
      found?.installments.map(({ number, amount, date, invoice }) => [
        number,
        amount,
        date,
        invoice.referenceMonth,
      ]),
    ).toEqual([
      [1, 3334, '2026-10-29', '2026-11-01'],
      [2, 3333, '2026-11-29', '2026-12-01'],
      [3, 3333, '2026-12-29', '2027-01-01'],
    ]);
    expect(found?.card.uuid).toBe(f.card.uuid);
    expect(found?.category.uuid).toBe(f.groceries.uuid);
  });

  it('reuses the invoice of a card and month instead of creating another', async () => {
    const f = await fixture();
    const first = await purchase(f, 100, '2026-10-29');
    const second = await purchase(f, 200, '2026-11-04');

    expect(second.installments[0].invoice.id).toBe(
      first.installments[0].invoice.id,
    );
    await expect(
      invoices.findByCardAndReferenceMonth(f.card.id, '2026-11-01'),
    ).resolves.toMatchObject({
      closingDate: '2026-11-05',
      dueDate: '2026-11-12',
    });
  });

  it("never returns another user's card, purchase, or invoice", async () => {
    const f = await fixture();
    const stranger = await insertUser();
    const created = await purchase(f, 100, '2026-10-29');

    await expect(
      cards.findByUuidForOwner(f.card.uuid, stranger),
    ).resolves.toBeNull();
    await expect(
      purchases.findByUuidForOwner(created.uuid, stranger),
    ).resolves.toBeNull();
    await expect(
      invoices.findByUuidForOwner(
        created.installments[0].invoice.uuid,
        stranger,
      ),
    ).resolves.toBeNull();
    await expect(invoices.findTotals(stranger)).resolves.toEqual([]);
    await expect(
      purchases.findAllPaginatedByOwner(stranger, 0, 20),
    ).resolves.toEqual({ items: [], total: 0 });
  });

  it('lists cards with the default first and filters by name and status', async () => {
    const f = await fixture();
    const archived = await createCard(f.ownerId, 'Amex');
    await cards.update(archived.withStatus(RecordStatus.INACTIVE));
    await createCard(f.ownerId, 'Master');

    const all = await cards.findAllPaginatedByOwner(f.ownerId, 0, 20);

    expect(all.items.map(({ name }) => name)).toEqual([
      'Visa',
      'Amex',
      'Master',
    ]);

    const active = await cards.findAllPaginatedByOwner(f.ownerId, 0, 20, {
      status: RecordStatus.ACTIVE,
      name: 'mas',
    });

    expect(active.items.map(({ name }) => name)).toEqual(['Master']);
  });

  it('clears the default card, locks the owner cards, and soft-deletes', async () => {
    const f = await fixture();

    await transactionManager.runInTransaction(async () => {
      await cards.lockOwnerCards(f.ownerId);
      await cards.clearDefault(f.ownerId);
    });

    await expect(
      cards.findByUuidForOwner(f.card.uuid, f.ownerId),
    ).resolves.toMatchObject({ isDefault: false });

    await expect(cards.hasHistory(f.ownerId, f.card.id)).resolves.toBe(false);
    await cards.softDelete(f.card);
    await expect(
      cards.findByUuidForOwner(f.card.uuid, f.ownerId),
    ).resolves.toBeNull();
  });

  it('allows only one default card per owner', async () => {
    const f = await fixture();

    await expect(createCard(f.ownerId, 'Other', true)).rejects.toBeInstanceOf(
      QueryFailedError,
    );
  });

  it('totals charges, refunds, and live payments per invoice', async () => {
    const f = await fixture();
    const shoes = await purchase(f, 30000, '2026-10-29', 3);
    await purchase(f, 5000, '2026-11-01');
    const deleted = await purchase(f, 999, '2026-11-02');
    await purchases.softDelete(deleted);

    await refund(f, shoes, 1500, '2026-11-10');

    const november = shoes.installments[0].invoice;

    const pay = (amount: number) =>
      payments.create(
        CreditCardPaymentEntity.create({
          uuid: randomUUID(),
          ownerId: f.ownerId,
          invoice: november,
          account: f.bank,
          amount,
          paidOn: '2026-11-12',
        }),
      );

    await pay(10000);
    const canceled = await pay(2000);
    await payments.update(canceled.cancel());

    const totals = await invoices.findTotals(f.ownerId, {
      cardIds: [f.card.id],
    });

    expect(
      totals.map(({ invoice, charges, credits, paid }) => [
        invoice.referenceMonth,
        charges,
        credits,
        paid,
      ]),
    ).toEqual([
      ['2026-11-01', 15000, 0, 10000],
      ['2026-12-01', 10000, 1500, 0],
      ['2027-01-01', 10000, 0, 0],
    ]);

    await expect(
      payments.sumByAccount(f.ownerId, [f.bank.id]),
    ).resolves.toEqual(new Map([[f.bank.id, 10000]]));
    await expect(payments.sumByAccount(f.ownerId, [])).resolves.toEqual(
      new Map(),
    );
    await expect(payments.existsForAccount(f.ownerId, f.bank.id)).resolves.toBe(
      true,
    );

    const reloaded = await payments.findByUuidForInvoice(
      canceled.uuid,
      november.id,
    );

    expect(reloaded?.canceledAt).toBeInstanceOf(Date);
  });

  it('lists the entries of an invoice', async () => {
    const f = await fixture();
    const shoes = await purchase(f, 30000, '2026-10-29', 3, 'Shoes');
    const back = await refund(f, shoes, 1500, '2026-11-20');

    const entries = await invoices.findEntries(shoes.installments[1].invoice);

    expect(entries.charges).toEqual([
      expect.objectContaining({
        purchaseUuid: shoes.uuid,
        description: 'Shoes',
        installmentNumber: 2,
        installmentCount: 3,
        amount: 10000,
        date: '2026-11-29',
      }),
    ]);
    expect(entries.refunds.map(({ uuid }) => uuid)).toEqual([back.uuid]);
    expect(entries.payments).toEqual([]);

    await refunds.softDelete(back);
    await expect(
      refunds.findByUuidForPurchase(back.uuid, shoes.id),
    ).resolves.toBeNull();
  });

  it('sums spending by category per perspective, net of refunds', async () => {
    const f = await fixture();
    const shoes = await purchase(f, 30000, '2026-10-29', 3);
    await refund(f, shoes, 1500, '2026-10-30');

    const spending = (perspective: SpendingPerspective, month: number) =>
      purchases
        .sumSpendingByCategory(f.ownerId, {
          from: firstDayOf({ year: 2026, month }),
          to: lastDayOf({ year: 2026, month }),
          perspective,
        })
        .then((totals) => totals.map(({ total }) => total));

    await expect(
      spending(SpendingPerspective.PURCHASE_DATE, 10),
    ).resolves.toEqual([8500]);
    await expect(
      spending(SpendingPerspective.INVOICE_MONTH, 10),
    ).resolves.toEqual([]);
    await expect(
      spending(SpendingPerspective.INVOICE_MONTH, 11),
    ).resolves.toEqual([8500]);
  });

  it('filters purchases and orders them by date, newest first', async () => {
    const f = await fixture();
    const older = await purchase(f, 100, '2026-10-01', 1, 'Market A');
    const newer = await purchase(f, 100, '2026-10-20', 1, 'Market B');
    await purchase(f, 100, '2026-11-02', 1, 'Pharmacy');

    const october = await purchases.findAllPaginatedByOwner(f.ownerId, 0, 20, {
      cardUuid: f.card.uuid,
      categoryUuid: f.groceries.uuid,
      from: '2026-10-01',
      to: '2026-10-31',
      description: 'market',
    });

    expect(october.items.map(({ uuid }) => uuid)).toEqual([
      newer.uuid,
      older.uuid,
    ]);
    expect(october.total).toBe(2);
    await expect(cards.hasHistory(f.ownerId, f.card.id)).resolves.toBe(true);
  });

  it('updates the details of a purchase', async () => {
    const f = await fixture();
    const created = await purchase(f, 100, '2026-10-01');

    await purchases.update(
      created.withDetails({
        description: 'Bakery',
        category: f.groceries,
        notes: 'bread',
      }),
    );

    await expect(
      purchases.findByUuidForOwner(created.uuid, f.ownerId),
    ).resolves.toMatchObject({ description: 'Bakery', notes: 'bread' });
  });

  it.each([
    ['a negative limit', 'credit_cards', `"credit_limit" = -1`],
    ['a closing day out of range', 'credit_cards', `"closing_day" = 32`],
    ['a non-positive purchase amount', 'credit_card_purchases', `"amount" = 0`],
  ])('rejects %s at the database level', async (_, table, assignment) => {
    const f = await fixture();
    const created = await purchase(f, 100, '2026-10-01');
    const id = table === 'credit_cards' ? f.card.id : created.id;

    await expect(
      dataSource.query(`UPDATE "${table}" SET ${assignment} WHERE "id" = $1`, [
        id,
      ]),
    ).rejects.toBeInstanceOf(QueryFailedError);
  });
});
