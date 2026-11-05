import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { CreditCardInvoiceOrmEntity } from '@modules/credit-cards/infrastructure/persistence/entities/credit-card-invoice.orm-entity';
import { CreditCardPaymentOrmEntity } from '@modules/credit-cards/infrastructure/persistence/entities/credit-card-payment.orm-entity';
import { TypeOrmCreditCardInvoiceRepository } from '@modules/credit-cards/infrastructure/persistence/repositories/typeorm-credit-card-invoice.repository';
import { TypeOrmCreditCardPaymentRepository } from '@modules/credit-cards/infrastructure/persistence/repositories/typeorm-credit-card-payment.repository';
import { InvestmentMovementOrmEntity } from '@modules/investments/infrastructure/persistence/entities/investment-movement.orm-entity';
import { TypeOrmInvestmentMovementRepository } from '@modules/investments/infrastructure/persistence/repositories/typeorm-investment-movement.repository';
import { TransactionState } from '@modules/transactions';
import { readConnection } from '@test/support/postgres/connection-handoff';
import { createSchemaDataSource } from '@test/support/postgres/lifecycle';

const FIRST_FINANCIAL_MIGRATION = '1793896076380';
const MIGRATIONS_DIRECTORY = join(__dirname, '..', 'migrations');

describe('Financial feature migrations (integration)', () => {
  let administration: DataSource;
  let database: DataSource;
  let databaseName: string;

  beforeAll(async () => {
    administration = createSchemaDataSource(readConnection());
    await administration.initialize();
  });

  beforeEach(async () => {
    databaseName = `financial_migration_${randomUUID().replaceAll('-', '')}`;
    await administration.query(`CREATE DATABASE "${databaseName}"`);

    const configured = createSchemaDataSource({
      ...readConnection(),
      database: databaseName,
    });

    const baseline = new DataSource({
      ...configured.options,
      migrations: readdirSync(MIGRATIONS_DIRECTORY)
        .filter(
          (file) => file.endsWith('.ts') && file < FIRST_FINANCIAL_MIGRATION,
        )
        .map((file) => join(MIGRATIONS_DIRECTORY, file)),
    });

    await baseline.initialize();
    await baseline.runMigrations({ transaction: 'all' });
    await seedExistingFinances(baseline);
    await baseline.destroy();

    database = configured;
    await database.initialize();
  });

  afterEach(async () => {
    if (database?.isInitialized) {
      await database.destroy();
    }

    await administration.query(`DROP DATABASE "${databaseName}"`);
  });

  afterAll(async () => {
    await administration.destroy();
  });

  it('upgrades populated finances atomically and keeps account and invoice totals', async () => {
    const before = await existingRecords(database);
    const applied = await database.runMigrations({ transaction: 'all' });

    expect(applied.map((migration) => migration.timestamp)).toEqual([
      1793896076380, 1793897757086,
    ]);
    expect(await existingRecords(database)).toEqual(before);
    expect(await database.runMigrations()).toEqual([]);
    expect(
      await database.query('SELECT DISTINCT source FROM credit_card_payments'),
    ).toEqual([{ source: 'ACCOUNT' }]);
    expect(
      await database.query(
        'SELECT DISTINCT contribution_kind FROM investment_movements',
      ),
    ).toEqual([{ contribution_kind: 'ONE_TIME' }]);
    expect(await accountPaymentTotal()).toBe(25_000);

    const movements = new TypeOrmInvestmentMovementRepository(
      database.getRepository(InvestmentMovementOrmEntity),
    );

    expect(
      await movements.sumAccountChanges(1, [1], {
        state: TransactionState.COMPLETED,
      }),
    ).toEqual(new Map([[1, -15_000]]));
    expect(
      await movements.sumAccountChanges(1, [1], {
        state: TransactionState.PLANNED,
      }),
    ).toEqual(new Map([[1, -10_000]]));

    await insertHistoricalSettlement();

    const payments = paymentRepository();

    const invoices = new TypeOrmCreditCardInvoiceRepository(
      database.getRepository(CreditCardInvoiceOrmEntity),
    );

    expect(await accountPaymentTotal()).toBe(25_000);
    expect(await payments.findEarliestDateForAccount(1, 1)).toBe('2026-02-10');
    expect(await payments.findLatestHistoricalDateForAccount(1, 1)).toBe(
      '2026-01-20',
    );
    expect(await invoices.findTotals(1)).toEqual([
      expect.objectContaining({ paid: 40_000 }),
    ]);
    expect(await existingRecords(database)).toEqual(before);
    await expect(insertHistoricalSettlement()).rejects.toMatchObject({
      driverError: {
        code: '23505',
        constraint: 'uq_credit_card_payments_historical_settlement',
      },
    });
  });

  it('can revert and reapply before feature records exist without changing history', async () => {
    const before = await existingRecords(database);

    await database.runMigrations({ transaction: 'all' });
    await database.undoLastMigration({ transaction: 'all' });
    await database.undoLastMigration({ transaction: 'all' });

    expect(await existingRecords(database)).toEqual(before);

    await database.runMigrations({ transaction: 'all' });

    expect(await existingRecords(database)).toEqual(before);
    expect(await accountPaymentTotal()).toBe(25_000);
  });

  it.each([
    { state: 'ACTIVE', deleted: false },
    { state: 'ENDED', deleted: false },
    { state: 'ENDED', deleted: true },
  ])(
    'rolls back a failed recurrence revert atomically for $state, deleted=$deleted',
    async ({ state, deleted }) => {
      await database.runMigrations({ transaction: 'all' });
      await database.query(
        `INSERT INTO recurrences
        (user_id, type, description, amount, frequency, start_date, state, account_id, investment_id, deleted_at)
       VALUES (1, 'INVESTMENT_CONTRIBUTION', 'Reserve', 100, 'MONTHLY', '2026-02-01', $1, 1, 1, $2)`,
        [state, deleted ? new Date('2026-03-01T00:00:00Z') : null],
      );

      const before = await existingRecords(database);

      const migrationsBefore: unknown[] = await database.query(
        'SELECT * FROM migrations ORDER BY id',
      );

      const contributionBefore: unknown[] = await database.query(
        'SELECT * FROM recurrences WHERE id = 3',
      );

      await expect(
        database.undoLastMigration({ transaction: 'all' }),
      ).rejects.toMatchObject({
        driverError: { code: '23502' },
      });

      expect(await existingRecords(database)).toEqual(before);
      expect(
        await database.query('SELECT * FROM recurrences WHERE id = 3'),
      ).toEqual(contributionBefore);
      expect(
        await database.query('SELECT * FROM migrations ORDER BY id'),
      ).toEqual(migrationsBefore);
      expect(
        await database.query(
          `SELECT indexname FROM pg_indexes WHERE indexname = 'uq_investment_movements_recurrence_occurrence'`,
        ),
      ).toHaveLength(1);
      expect(await database.driver.createSchemaBuilder().log()).toMatchObject({
        upQueries: [],
      });
    },
  );

  it('demonstrates why dropping settlement source is unsafe even when all rows survive', async () => {
    await database.runMigrations({ transaction: 'all' });
    await insertHistoricalSettlement();

    expect(await accountPaymentTotal()).toBe(25_000);

    await database.undoLastMigration({ transaction: 'all' });
    await database.undoLastMigration({ transaction: 'all' });

    expect(
      await database.query(
        `SELECT SUM(amount)::text AS total FROM credit_card_payments WHERE canceled_at IS NULL AND deleted_at IS NULL`,
      ),
    ).toEqual([{ total: '400.00' }]);
    expect(
      await database.query(
        `SELECT amount::text, paid_on::text FROM credit_card_payments WHERE paid_on < '2026-02-01'`,
      ),
    ).toEqual([{ amount: '150.00', paid_on: '2026-01-20' }]);
  });

  function paymentRepository(): TypeOrmCreditCardPaymentRepository {
    return new TypeOrmCreditCardPaymentRepository(
      database.getRepository(CreditCardPaymentOrmEntity),
    );
  }

  async function accountPaymentTotal(): Promise<number | undefined> {
    return (await paymentRepository().sumByAccount(1, [1])).get(1);
  }

  async function insertHistoricalSettlement(): Promise<void> {
    await database.query(
      `INSERT INTO credit_card_payments (user_id, invoice_id, account_id, amount, paid_on, source)
       VALUES (1, 1, 1, 150, '2026-01-20', 'HISTORICAL_SETTLEMENT')`,
    );
  }
});

async function existingRecords(database: DataSource): Promise<unknown[][]> {
  const records: unknown[][] = [];

  for (const [table, columns, lastExistingId] of [
    [
      'accounts',
      'id, uuid, opening_balance, opening_balance_date, status, deleted_at',
      1,
    ],
    [
      'credit_card_payments',
      'id, uuid, invoice_id, account_id, amount, paid_on, canceled_at, deleted_at',
      3,
    ],
    [
      'investment_movements',
      'id, uuid, type, amount, date, state, completed_on, canceled_at, deleted_at',
      5,
    ],
    [
      'recurrences',
      'id, uuid, type, description, amount, category_id, state, generated_through, deleted_at',
      2,
    ],
    [
      'transactions',
      'id, uuid, type, amount, date, state, completed_on, canceled_at, recurrence_id, recurrence_date',
      3,
    ],
  ]) {
    const rows: unknown[] = await database.query(
      `SELECT ${columns} FROM ${table} WHERE id <= $1 ORDER BY id`,
      [lastExistingId],
    );

    records.push(rows);
  }

  return records;
}

async function seedExistingFinances(database: DataSource): Promise<void> {
  await database.query(
    `INSERT INTO users (id, name, email, password) VALUES (1, 'Migration', 'migration@example.com', 'not-a-real-password')`,
  );
  await database.query(
    `INSERT INTO accounts (id, user_id, name, type, opening_balance, opening_balance_date) VALUES (1, 1, 'Bank', 'CHECKING', 2000, '2026-02-01')`,
  );
  await database.query(
    `INSERT INTO transaction_categories (id, user_id, name, kind) VALUES (1, 1, 'Expense', 'EXPENSE')`,
  );
  await database.query(
    `INSERT INTO credit_cards (id, user_id, name, credit_limit, closing_day, due_day) VALUES (1, 1, 'Card', 10000, 20, 28)`,
  );
  await database.query(
    `INSERT INTO credit_card_invoices (id, user_id, credit_card_id, reference_month, closing_date, due_date) VALUES (1, 1, 1, '2026-03-01', '2026-02-20', '2026-03-28')`,
  );
  await database.query(
    `INSERT INTO investments (id, user_id, name, type) VALUES (1, 1, 'Reserve', 'RESERVE')`,
  );
  await database.query(`INSERT INTO recurrences (id, user_id, type, description, amount, frequency, start_date, state, account_id, credit_card_id, category_id, generated_through) VALUES
    (1, 1, 'EXPENSE', 'Account recurrence', 50, 'MONTHLY', '2026-02-10', 'PAUSED', 1, NULL, 1, '2027-02-28'),
    (2, 1, 'EXPENSE', 'Card recurrence', 20, 'MONTHLY', '2026-02-10', 'ACTIVE', NULL, 1, 1, '2027-02-28')`);
  await database.query(
    `SELECT setval(pg_get_serial_sequence('recurrences', 'id'), 2)`,
  );
  await database.query(`INSERT INTO transactions (id, user_id, type, description, amount, date, state, completed_on, canceled_at, account_id, category_id, recurrence_id, recurrence_date) VALUES
    (1, 1, 'EXPENSE', 'Completed', 100, '2026-02-10', 'COMPLETED', '2026-02-10', NULL, 1, 1, 1, '2026-02-10'),
    (2, 1, 'EXPENSE', 'Planned', 50, '2026-03-10', 'PLANNED', NULL, NULL, 1, 1, 1, '2026-03-10'),
    (3, 1, 'EXPENSE', 'Canceled', 25, '2026-04-10', 'CANCELED', NULL, now(), 1, 1, 1, '2026-04-10')`);
  await database.query(`INSERT INTO credit_card_payments (id, user_id, invoice_id, account_id, amount, paid_on, canceled_at, deleted_at) VALUES
    (1, 1, 1, 1, 250, '2026-02-10', NULL, NULL),
    (2, 1, 1, 1, 100, '2026-02-11', now(), NULL),
    (3, 1, 1, 1, 75, '2026-02-12', NULL, now())`);
  await database.query(
    `SELECT setval(pg_get_serial_sequence('credit_card_payments', 'id'), 3)`,
  );
  await database.query(`INSERT INTO investment_movements (id, user_id, investment_id, account_id, type, amount, date, state, completed_on, canceled_at) VALUES
    (1, 1, 1, 1, 'CONTRIBUTION', 200, '2026-02-05', 'COMPLETED', '2026-02-05', NULL),
    (2, 1, 1, 1, 'WITHDRAWAL', 50, '2026-02-09', 'COMPLETED', '2026-02-09', NULL),
    (3, 1, 1, 1, 'CONTRIBUTION', 100, '2026-03-05', 'PLANNED', NULL, NULL),
    (4, 1, 1, 1, 'CONTRIBUTION', 75, '2026-02-06', 'CANCELED', NULL, now()),
    (5, 1, 1, NULL, 'VALUATION', 20, '2026-02-15', 'COMPLETED', '2026-02-15', NULL)`);
}
