import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import { EmailType } from '@shared/domain/enums/email-type.enum';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { getTransactionalEntityManager } from '@shared/infrastructure/persistence';
import { EmailSendLogOrmEntity } from '../../entities/email-send-log.orm-entity';
import { TypeOrmEmailSendLogRepository } from '../typeorm-email-send-log.repository';

// Rows inserted by `consumeDailySlot` get `created_at = CURRENT_TIMESTAMP`, not
// `day`, so tests counting their own inserts must use `day = TODAY`. Tests that
// need a row on another day seed it directly via `seedRowOnDay`.
const TODAY = new Date().toISOString().slice(0, 10);

describe('TypeOrmEmailSendLogRepository (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let repository: TypeOrmEmailSendLogRepository;
  let transactionManager: TransactionManagerPort;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        CoreConfigModule,
        DatabaseModule,
        TypeOrmModule.forFeature([EmailSendLogOrmEntity]),
      ],
      providers: [TypeOrmEmailSendLogRepository],
    }).compile();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
    repository = moduleRef.get(TypeOrmEmailSendLogRepository);
    transactionManager = moduleRef.get(TRANSACTION_MANAGER);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "email_send_logs" RESTART IDENTITY CASCADE',
    );
  });

  async function countRows(
    emailType: EmailType,
    recipient: string,
    day: string,
  ): Promise<number> {
    const dayStart = new Date(`${day}T00:00:00.000Z`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const rows: Array<{ count: string }> = await dataSource.query(
      'SELECT COUNT(*)::text AS count FROM "email_send_logs" WHERE email_type = $1 AND recipient = $2 AND created_at >= $3 AND created_at < $4',
      [emailType, recipient, dayStart, dayEnd],
    );

    return Number(rows[0].count);
  }

  async function seedRowOnDay(
    emailType: EmailType,
    recipient: string,
    day: string,
  ): Promise<void> {
    await dataSource.query(
      'INSERT INTO "email_send_logs" (email_type, recipient, created_at) VALUES ($1, $2, $3)',
      [emailType, recipient, `${day}T12:00:00.000Z`],
    );
  }

  it('appends a row per call and returns the running count, denying once the limit is reached (append-only, no row on denial)', async () => {
    const input = {
      emailType: EmailType.PASSWORD_RESET,
      recipient: 'jane@example.com',
      day: TODAY,
      limit: 5,
    };

    for (let attempt = 1; attempt <= 5; attempt++) {
      await expect(repository.consumeDailySlot(input)).resolves.toBe(attempt);
    }

    await expect(repository.consumeDailySlot(input)).resolves.toBeNull();

    await expect(
      countRows(input.emailType, input.recipient, input.day),
    ).resolves.toBe(5);
  });

  it('keeps per-recipient budgets independent: exhausting one recipient leaves another at full budget', async () => {
    const shared = {
      emailType: EmailType.PASSWORD_RESET,
      day: TODAY,
      limit: 5,
    };

    for (let attempt = 1; attempt <= 5; attempt++) {
      await expect(
        repository.consumeDailySlot({
          ...shared,
          recipient: 'admin@example.com',
        }),
      ).resolves.toBe(attempt);
    }

    await expect(
      repository.consumeDailySlot({
        ...shared,
        recipient: 'admin@example.com',
      }),
    ).resolves.toBeNull();

    await expect(
      repository.consumeDailySlot({
        ...shared,
        recipient: 'arthur@example.com',
      }),
    ).resolves.toBe(1);
  });

  it('keeps per-type budgets independent for the same recipient/day', async () => {
    const shared = {
      recipient: 'jane@example.com',
      day: TODAY,
      limit: 1,
    };

    await expect(
      repository.consumeDailySlot({
        ...shared,
        emailType: EmailType.PASSWORD_RESET,
      }),
    ).resolves.toBe(1);

    await expect(
      repository.consumeDailySlot({
        ...shared,
        emailType: EmailType.PASSWORD_RESET,
      }),
    ).resolves.toBeNull();

    await expect(
      repository.consumeDailySlot({
        ...shared,
        emailType: EmailType.EMAIL_CONFIRMATION,
      }),
    ).resolves.toBe(1);
  });

  it('keeps per-day budgets independent for the same recipient/type', async () => {
    const shared = {
      recipient: 'jane@example.com',
      emailType: EmailType.PASSWORD_RESET,
      limit: 1,
    };

    const dayOne = '2026-08-01';
    const dayTwo = '2026-08-02';

    await seedRowOnDay(shared.emailType, shared.recipient, dayOne);

    await expect(
      repository.consumeDailySlot({ ...shared, day: dayOne }),
    ).resolves.toBeNull();

    await expect(
      repository.consumeDailySlot({ ...shared, day: dayTwo }),
    ).resolves.toBe(1);
  });

  it('under ~20 concurrent calls for the same key, allows exactly the limit and denies the rest (advisory lock prevents the TOCTOU race)', async () => {
    const input = {
      emailType: EmailType.PASSWORD_RESET,
      recipient: 'concurrent@example.com',
      day: TODAY,
      limit: 5,
    };

    const results = await Promise.all(
      Array.from({ length: 20 }, () => repository.consumeDailySlot(input)),
    );

    const allowed = results.filter((result) => result !== null);
    const denied = results.filter((result) => result === null);

    expect(allowed).toHaveLength(5);
    expect(denied).toHaveLength(15);

    await expect(
      countRows(input.emailType, input.recipient, input.day),
    ).resolves.toBe(5);
  });

  it("under concurrency, two different recipients do not contend for or steal each other's slots", async () => {
    const shared = {
      emailType: EmailType.PASSWORD_RESET,
      day: TODAY,
      limit: 5,
    };

    const recipientA = 'concurrent-a@example.com';
    const recipientB = 'concurrent-b@example.com';

    const callsA = Array.from({ length: 20 }, () =>
      repository.consumeDailySlot({ ...shared, recipient: recipientA }),
    );

    const callsB = Array.from({ length: 20 }, () =>
      repository.consumeDailySlot({ ...shared, recipient: recipientB }),
    );

    const [resultsA, resultsB] = await Promise.all([
      Promise.all(callsA),
      Promise.all(callsB),
    ]);

    expect(resultsA.filter((result) => result !== null)).toHaveLength(5);
    expect(resultsB.filter((result) => result !== null)).toHaveLength(5);

    await expect(
      countRows(shared.emailType, recipientA, shared.day),
    ).resolves.toBe(5);
    await expect(
      countRows(shared.emailType, recipientB, shared.day),
    ).resolves.toBe(5);
  });

  describe('deleteCreatedBefore', () => {
    const cutoff = new Date('2026-01-10T00:00:00.000Z');

    async function insertCreatedAt(createdAt: Date): Promise<number> {
      const rows: Array<{ id: number }> = await dataSource.query(
        'INSERT INTO "email_send_logs" (email_type, recipient, created_at) VALUES ($1, $2, $3) RETURNING id',
        [EmailType.PASSWORD_RESET, 'jane@example.com', createdAt],
      );

      return rows[0].id;
    }

    async function remainingIds(): Promise<number[]> {
      const rows: Array<{ id: number }> = await dataSource.query(
        'SELECT id FROM "email_send_logs" ORDER BY id',
      );

      return rows.map((row) => row.id);
    }

    it('deletes only rows created strictly before the cutoff', async () => {
      await insertCreatedAt(new Date(cutoff.getTime() - 1));

      const atCutoff = await insertCreatedAt(cutoff);
      const afterCutoff = await insertCreatedAt(new Date(cutoff.getTime() + 1));

      await expect(repository.deleteCreatedBefore(cutoff, 100)).resolves.toBe(
        1,
      );
      await expect(remainingIds()).resolves.toEqual([atCutoff, afterCutoff]);
    });

    it('deletes at most limit rows per call, oldest first, and is safe to repeat', async () => {
      const createdAt = new Date(cutoff.getTime() - 60_000);

      await insertCreatedAt(createdAt);
      await insertCreatedAt(createdAt);

      const newest = await insertCreatedAt(createdAt);

      await expect(repository.deleteCreatedBefore(cutoff, 2)).resolves.toBe(2);
      await expect(remainingIds()).resolves.toEqual([newest]);
      await expect(repository.deleteCreatedBefore(cutoff, 2)).resolves.toBe(1);
      await expect(repository.deleteCreatedBefore(cutoff, 2)).resolves.toBe(0);
    });

    it('keeps the rows that count toward the current UTC day quota', async () => {
      const input = {
        emailType: EmailType.PASSWORD_RESET,
        recipient: 'jane@example.com',
        day: TODAY,
        limit: 1,
      };

      await expect(repository.consumeDailySlot(input)).resolves.toBe(1);

      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      await expect(
        repository.deleteCreatedBefore(oneDayAgo, 100),
      ).resolves.toBe(0);
      await expect(repository.consumeDailySlot(input)).resolves.toBeNull();
    });
  });

  describe('inside an outer transaction', () => {
    const input = {
      emailType: EmailType.EMAIL_CONFIRMATION,
      recipient: 'outer@example.com',
      day: TODAY,
      limit: 5,
    };

    it('rolls the consumed slot back with the outer transaction', async () => {
      await expect(
        transactionManager.runInTransaction(async () => {
          await expect(repository.consumeDailySlot(input)).resolves.toBe(1);
          throw new Error('outer boom');
        }),
      ).rejects.toThrow('outer boom');

      await expect(
        countRows(input.emailType, input.recipient, input.day),
      ).resolves.toBe(0);
    });

    it("restores the caller's lock_timeout after taking the advisory lock", async () => {
      const lockTimeout = await transactionManager.runInTransaction(
        async () => {
          await repository.consumeDailySlot(input);

          const rows = (await getTransactionalEntityManager()?.query(
            'SHOW lock_timeout',
          )) as Array<{ lock_timeout: string }>;

          return rows[0].lock_timeout;
        },
      );

      expect(lockTimeout).toBe('0');
    });

    it('keeps the outer transaction usable after a lock timeout and commits its other writes', async () => {
      const blocker = dataSource.createQueryRunner();
      await blocker.connect();
      await blocker.startTransaction();
      await blocker.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`email-quota:${input.emailType}:${input.recipient}:${input.day}`],
      );

      try {
        await transactionManager.runInTransaction(async () => {
          await expect(repository.consumeDailySlot(input)).rejects.toThrow(
            /lock timeout/,
          );

          await expect(
            repository.consumeDailySlot({
              ...input,
              recipient: 'other@example.com',
            }),
          ).resolves.toBe(1);
        });
      } finally {
        await blocker.rollbackTransaction();
        await blocker.release();
      }

      await expect(
        countRows(input.emailType, 'other@example.com', input.day),
      ).resolves.toBe(1);
      await expect(
        countRows(input.emailType, input.recipient, input.day),
      ).resolves.toBe(0);
    });

    it('holds the advisory lock until the outer commit, so concurrent outer transactions never overshoot the limit', async () => {
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          transactionManager.runInTransaction(async () => {
            const used = await repository.consumeDailySlot({
              ...input,
              limit: 3,
            });

            // Widen the window between the slot insert and COMMIT.
            await new Promise((resolve) => setTimeout(resolve, 20));

            return used;
          }),
        ),
      );

      expect(results.filter((result) => result !== null)).toHaveLength(3);
      await expect(
        countRows(input.emailType, input.recipient, input.day),
      ).resolves.toBe(3);
    });
  });
});
