import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import { EmailType } from '@shared/domain/enums/email-type.enum';
import {
  EMAIL_JOB_HANDLER_REGISTRY,
  EMAIL_OUTBOX_PORT,
  TRANSACTION_MANAGER,
  type EmailJob,
  type EmailJobHandlerRegistry,
  type EmailOutboxPort,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { EmailJobStatus } from '../../../domain/enums/email-job-status.enum';
import { EmailOutboxModule } from '../../../email-outbox.module';
import { DispatchEmailOutboxUseCase } from '../dispatch-email-outbox.use-case';

const TODAY = new Date().toISOString().slice(0, 10);

interface Instance {
  moduleRef: TestingModule;
  outbox: EmailOutboxPort;
  dispatcher: DispatchEmailOutboxUseCase;
  transactions: TransactionManagerPort;
  dataSource: DataSource;
  handle: jest.Mock<Promise<void>, [EmailJob]>;
}

// Each instance stands in for one API process: its own Nest container, its
// own connection pool, and its own registered handler.
async function startInstance(): Promise<Instance> {
  const moduleRef = await Test.createTestingModule({
    imports: [CoreConfigModule, DatabaseModule, EmailOutboxModule],
  }).compile();

  const handle = jest.fn<Promise<void>, [EmailJob]>(() => Promise.resolve());

  moduleRef
    .get<EmailJobHandlerRegistry>(EMAIL_JOB_HANDLER_REGISTRY)
    .register(EmailType.PASSWORD_RESET, { handle });

  return {
    moduleRef,
    outbox: moduleRef.get<EmailOutboxPort>(EMAIL_OUTBOX_PORT),
    dispatcher: moduleRef.get(DispatchEmailOutboxUseCase),
    transactions: moduleRef.get<TransactionManagerPort>(TRANSACTION_MANAGER),
    dataSource: moduleRef.get<DataSource>(getDataSourceToken()),
    handle,
  };
}

async function waitUntil(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 5000;

  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for the condition');
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('Email outbox delivery (integration)', () => {
  let instance: Instance;

  beforeAll(() => {
    process.env.MAIL_DAILY_LIMIT_PASSWORD_RESET = '2';
    process.env.EMAIL_OUTBOX_MAX_ATTEMPTS = '3';
    process.env.EMAIL_OUTBOX_WORKER_ENABLED = 'false';
  });

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    instance = await startInstance();
  });

  afterEach(async () => {
    await instance.dataSource.query(
      'TRUNCATE TABLE "email_outbox", "email_send_logs" RESTART IDENTITY CASCADE',
    );
    await instance.moduleRef.close();
    jest.restoreAllMocks();
  });

  afterAll(() => {
    delete process.env.MAIL_DAILY_LIMIT_PASSWORD_RESET;
    delete process.env.EMAIL_OUTBOX_MAX_ATTEMPTS;
    delete process.env.EMAIL_OUTBOX_WORKER_ENABLED;
  });

  function schedule(recipient: string) {
    return instance.outbox.schedule({
      emailType: EmailType.PASSWORD_RESET,
      recipient,
    });
  }

  async function countRows(table: string, recipient: string): Promise<number> {
    const rows: Array<{ count: string }> = await instance.dataSource.query(
      `SELECT COUNT(*)::text AS count FROM "${table}" WHERE recipient = $1`,
      [recipient],
    );

    return Number(rows[0].count);
  }

  async function jobStatus(
    recipient: string,
  ): Promise<{ status: EmailJobStatus; attempts: number }> {
    const rows: Array<{ status: EmailJobStatus; attempts: number }> =
      await instance.dataSource.query(
        'SELECT status, attempts FROM "email_outbox" WHERE recipient = $1',
        [recipient],
      );

    return rows[0];
  }

  // The dispatcher compares against a millisecond JS Date, while now() has
  // microsecond precision, so a job made due at now() can still look early.
  function skipBackoff(): Promise<unknown> {
    return instance.dataSource.query(
      `UPDATE "email_outbox" SET available_at = now() - interval '1 second' WHERE status = 'PENDING'`,
    );
  }

  it('schedules a job with its quota slot and delivers it on the next dispatch', async () => {
    await expect(schedule('Jane@Example.com')).resolves.toEqual({
      scheduled: true,
    });

    await expect(
      countRows('email_send_logs', 'jane@example.com'),
    ).resolves.toBe(1);

    await expect(instance.dispatcher.execute()).resolves.toEqual({
      sent: 1,
      retried: 0,
      failed: 0,
    });

    expect(instance.handle).toHaveBeenCalledTimes(1);
    expect(instance.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        emailType: EmailType.PASSWORD_RESET,
        recipient: 'jane@example.com',
        locale: 'pt-BR',
        attempt: 1,
      }),
    );
    await expect(jobStatus('jane@example.com')).resolves.toEqual({
      status: EmailJobStatus.SENT,
      attempts: 1,
    });
  });

  it('stops scheduling once the daily quota is spent, without enqueueing a job', async () => {
    await schedule('capped@example.com');
    await schedule('capped@example.com');

    await expect(schedule('capped@example.com')).resolves.toEqual({
      scheduled: false,
      reason: 'EXHAUSTED',
    });

    await expect(countRows('email_outbox', 'capped@example.com')).resolves.toBe(
      2,
    );
  });

  it('retries a failed delivery with the one slot it was scheduled with, never consuming more quota', async () => {
    instance.handle
      .mockRejectedValueOnce(new Error('421 try again'))
      .mockRejectedValueOnce(new Error('421 try again'));

    await schedule('flaky@example.com');

    await expect(instance.dispatcher.execute()).resolves.toMatchObject({
      retried: 1,
    });
    await skipBackoff();
    await expect(instance.dispatcher.execute()).resolves.toMatchObject({
      retried: 1,
    });
    await skipBackoff();
    await expect(instance.dispatcher.execute()).resolves.toMatchObject({
      sent: 1,
    });

    expect(instance.handle).toHaveBeenCalledTimes(3);
    await expect(jobStatus('flaky@example.com')).resolves.toEqual({
      status: EmailJobStatus.SENT,
      attempts: 3,
    });
    await expect(
      countRows('email_send_logs', 'flaky@example.com'),
    ).resolves.toBe(1);
  });

  it('marks the job FAILED after the last allowed attempt and never delivers it again', async () => {
    instance.handle.mockRejectedValue(new Error('550 mailbox unavailable'));

    await schedule('dead@example.com');

    for (let attempt = 0; attempt < 3; attempt++) {
      await instance.dispatcher.execute();
      await skipBackoff();
    }

    await expect(jobStatus('dead@example.com')).resolves.toEqual({
      status: EmailJobStatus.FAILED,
      attempts: 3,
    });

    await instance.dispatcher.execute();

    expect(instance.handle).toHaveBeenCalledTimes(3);
  });

  it('rolls the job and its quota slot back with a failed caller transaction', async () => {
    await expect(
      instance.transactions.runInTransaction(async () => {
        await expect(schedule('rollback@example.com')).resolves.toEqual({
          scheduled: true,
        });
        throw new Error('caller failed');
      }),
    ).rejects.toThrow('caller failed');

    await expect(
      countRows('email_outbox', 'rollback@example.com'),
    ).resolves.toBe(0);
    await expect(
      countRows('email_send_logs', 'rollback@example.com'),
    ).resolves.toBe(0);
  });

  it('fails closed when the quota cannot be checked: nothing is enqueued and the caller transaction still commits', async () => {
    const blocker = instance.dataSource.createQueryRunner();
    await blocker.connect();
    await blocker.startTransaction();
    await blocker.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`email-quota:${EmailType.PASSWORD_RESET}:blocked@example.com:${TODAY}`],
    );

    try {
      await instance.transactions.runInTransaction(async () => {
        await expect(schedule('blocked@example.com')).resolves.toEqual({
          scheduled: false,
          reason: 'UNAVAILABLE',
        });
        await expect(schedule('other@example.com')).resolves.toEqual({
          scheduled: true,
        });
      });
    } finally {
      await blocker.rollbackTransaction();
      await blocker.release();
    }

    await expect(
      countRows('email_outbox', 'blocked@example.com'),
    ).resolves.toBe(0);
    await expect(
      countRows('email_send_logs', 'blocked@example.com'),
    ).resolves.toBe(0);
    await expect(countRows('email_outbox', 'other@example.com')).resolves.toBe(
      1,
    );
  });

  it('delivers jobs left PENDING by a process that stopped before dispatching them', async () => {
    await schedule('restart@example.com');
    await instance.moduleRef.close();

    instance = await startInstance();

    await expect(instance.dispatcher.execute()).resolves.toMatchObject({
      sent: 1,
    });
    expect(instance.handle).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: 'restart@example.com' }),
    );
  });

  it('redelivers a job whose process crashed mid-delivery once its lease expires', async () => {
    await schedule('crash@example.com');

    instance.handle.mockImplementationOnce(() => new Promise(() => undefined));
    void instance.dispatcher.execute();

    await waitUntil(() => instance.handle.mock.calls.length === 1);

    await expect(jobStatus('crash@example.com')).resolves.toEqual({
      status: EmailJobStatus.PROCESSING,
      attempts: 1,
    });

    const crashed = instance;
    instance = await startInstance();

    await expect(instance.dispatcher.execute()).resolves.toMatchObject({
      sent: 0,
    });

    await instance.dataSource.query(
      `UPDATE "email_outbox" SET locked_until = now() - interval '1 second'`,
    );

    await expect(instance.dispatcher.execute()).resolves.toMatchObject({
      sent: 1,
    });
    expect(instance.handle).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: 'crash@example.com', attempt: 2 }),
    );
    await expect(jobStatus('crash@example.com')).resolves.toEqual({
      status: EmailJobStatus.SENT,
      attempts: 2,
    });

    await crashed.moduleRef.close();
  });

  it('delivers each job exactly once when two processes dispatch concurrently', async () => {
    const recipients = Array.from(
      { length: 10 },
      (_, index) => `parallel-${index}@example.com`,
    );

    for (const recipient of recipients) {
      await schedule(recipient);
    }

    const other = await startInstance();

    try {
      await Promise.all([
        instance.dispatcher.execute(),
        other.dispatcher.execute(),
      ]);

      const delivered = [
        ...instance.handle.mock.calls,
        ...other.handle.mock.calls,
      ].map(([job]) => job.recipient);

      expect(delivered.sort()).toEqual([...recipients].sort());
    } finally {
      await other.moduleRef.close();
    }
  });
});
