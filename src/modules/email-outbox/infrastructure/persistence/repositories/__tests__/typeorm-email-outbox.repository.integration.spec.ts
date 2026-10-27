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
import { EmailJobStatus } from '../../../../domain/enums/email-job-status.enum';
import { EmailOutboxJobOrmEntity } from '../../entities/email-outbox-job.orm-entity';
import { TypeOrmEmailOutboxRepository } from '../typeorm-email-outbox.repository';

const MINUTE = 60 * 1000;
const MAX_ATTEMPTS = 5;

describe('TypeOrmEmailOutboxRepository (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let repository: TypeOrmEmailOutboxRepository;
  let transactionManager: TransactionManagerPort;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        CoreConfigModule,
        DatabaseModule,
        TypeOrmModule.forFeature([EmailOutboxJobOrmEntity]),
      ],
      providers: [TypeOrmEmailOutboxRepository],
    }).compile();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
    repository = moduleRef.get(TypeOrmEmailOutboxRepository);
    transactionManager = moduleRef.get(TRANSACTION_MANAGER);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "email_outbox" RESTART IDENTITY CASCADE',
    );
  });

  function enqueue(
    recipient: string,
    availableAt = new Date(Date.now() - 1000),
  ): Promise<void> {
    return repository.enqueue({
      emailType: EmailType.PASSWORD_RESET,
      recipient,
      locale: 'en',
      availableAt,
    });
  }

  function findRow(recipient: string): Promise<EmailOutboxJobOrmEntity> {
    return dataSource
      .getRepository(EmailOutboxJobOrmEntity)
      .findOneByOrFail({ recipient });
  }

  function leaseFrom(now: Date): Date {
    return new Date(now.getTime() + 2 * MINUTE);
  }

  it('claims the oldest available PENDING job, flips it to PROCESSING, and counts the attempt', async () => {
    await enqueue('first@example.com', new Date(Date.now() - 2000));
    await enqueue('second@example.com', new Date(Date.now() - 1000));

    const now = new Date();

    const claimed = await repository.claimNext(
      now,
      leaseFrom(now),
      MAX_ATTEMPTS,
    );

    expect(claimed).toMatchObject({
      emailType: EmailType.PASSWORD_RESET,
      recipient: 'first@example.com',
      locale: 'en',
      attempts: 1,
    });

    const row = await findRow('first@example.com');

    expect(row.status).toBe(EmailJobStatus.PROCESSING);
    expect(row.lockedUntil?.getTime()).toBe(leaseFrom(now).getTime());
  });

  it('does not claim a job whose backoff has not elapsed', async () => {
    await enqueue('later@example.com', new Date(Date.now() + MINUTE));

    const now = new Date();

    await expect(
      repository.claimNext(now, leaseFrom(now), MAX_ATTEMPTS),
    ).resolves.toBeNull();
  });

  it('does not claim a PROCESSING job while its lease is still valid', async () => {
    await enqueue('busy@example.com');

    const now = new Date();
    await repository.claimNext(now, leaseFrom(now), MAX_ATTEMPTS);

    await expect(
      repository.claimNext(now, leaseFrom(now), MAX_ATTEMPTS),
    ).resolves.toBeNull();
  });

  it('reclaims a PROCESSING job whose lease expired (its worker crashed) as a new attempt', async () => {
    await enqueue('crashed@example.com');

    const claimedAt = new Date();
    await repository.claimNext(claimedAt, leaseFrom(claimedAt), MAX_ATTEMPTS);

    const afterLease = new Date(claimedAt.getTime() + 3 * MINUTE);

    const reclaimed = await repository.claimNext(
      afterLease,
      leaseFrom(afterLease),
      MAX_ATTEMPTS,
    );

    expect(reclaimed).toMatchObject({
      recipient: 'crashed@example.com',
      attempts: 2,
    });
  });

  it('never reclaims an expired job on its final attempt, and fails it instead', async () => {
    await enqueue('final@example.com');
    await dataSource
      .getRepository(EmailOutboxJobOrmEntity)
      .update(
        { recipient: 'final@example.com' },
        { attempts: MAX_ATTEMPTS - 1 },
      );

    const claimedAt = new Date();
    await repository.claimNext(claimedAt, leaseFrom(claimedAt), MAX_ATTEMPTS);

    const afterLease = new Date(claimedAt.getTime() + 3 * MINUTE);

    await expect(
      repository.claimNext(afterLease, leaseFrom(afterLease), MAX_ATTEMPTS),
    ).resolves.toBeNull();
    await expect(
      repository.failExpiredFinalAttempts(claimedAt, MAX_ATTEMPTS, 'expired'),
    ).resolves.toBe(0);
    await expect(
      repository.failExpiredFinalAttempts(afterLease, MAX_ATTEMPTS, 'expired'),
    ).resolves.toBe(1);
    await expect(findRow('final@example.com')).resolves.toMatchObject({
      status: EmailJobStatus.FAILED,
      attempts: MAX_ATTEMPTS,
      lastError: 'expired',
      lockedUntil: null,
    });
  });

  it('fences completions on the attempt: a stale run cannot overwrite the run that reclaimed the job', async () => {
    await enqueue('fenced@example.com');

    const claimedAt = new Date();

    const stale = await repository.claimNext(
      claimedAt,
      leaseFrom(claimedAt),
      MAX_ATTEMPTS,
    );

    const afterLease = new Date(claimedAt.getTime() + 3 * MINUTE);

    const current = await repository.claimNext(
      afterLease,
      leaseFrom(afterLease),
      MAX_ATTEMPTS,
    );

    await expect(repository.markSent(stale!, new Date())).resolves.toBe(false);
    await expect(
      repository.scheduleRetry(stale!, new Date(), 'late'),
    ).resolves.toBe(false);

    const failedAt = new Date();

    await expect(
      repository.markFailed(current!, failedAt, 'boom'),
    ).resolves.toBe(true);

    const row = await findRow('fenced@example.com');

    expect(row.status).toBe(EmailJobStatus.FAILED);
    expect(row.attempts).toBe(2);
    expect(row.lastError).toBe('boom');
    expect(row.lockedUntil).toBeNull();
    expect(row.processedAt?.getTime()).toBe(failedAt.getTime());
  });

  it('puts a retried job back to PENDING with its backoff and keeps it unprocessed', async () => {
    await enqueue('retry@example.com');

    const now = new Date();

    const claimed = await repository.claimNext(
      now,
      leaseFrom(now),
      MAX_ATTEMPTS,
    );

    const retryAt = new Date(now.getTime() + MINUTE);

    await expect(
      repository.scheduleRetry(claimed!, retryAt, 'timeout'),
    ).resolves.toBe(true);

    const row = await findRow('retry@example.com');

    expect(row.status).toBe(EmailJobStatus.PENDING);
    expect(row.availableAt.getTime()).toBe(retryAt.getTime());
    expect(row.lockedUntil).toBeNull();
    expect(row.processedAt).toBeNull();
    expect(row.lastError).toBe('timeout');
    await expect(
      repository.claimNext(now, leaseFrom(now), MAX_ATTEMPTS),
    ).resolves.toBeNull();
  });

  it('marks a delivered job SENT and never claims it again', async () => {
    await enqueue('sent@example.com');

    const now = new Date();

    const claimed = await repository.claimNext(
      now,
      leaseFrom(now),
      MAX_ATTEMPTS,
    );

    await expect(repository.markSent(claimed!, now)).resolves.toBe(true);

    const later = new Date(now.getTime() + 60 * MINUTE);

    await expect(
      repository.claimNext(later, leaseFrom(later), MAX_ATTEMPTS),
    ).resolves.toBeNull();
    await expect(findRow('sent@example.com')).resolves.toMatchObject({
      status: EmailJobStatus.SENT,
      lastError: null,
    });
  });

  it('hands each job to exactly one of many concurrent claimers (SKIP LOCKED)', async () => {
    for (let index = 0; index < 10; index++) {
      await enqueue(`concurrent-${index}@example.com`);
    }

    const now = new Date();

    const claims = await Promise.all(
      Array.from({ length: 15 }, () =>
        repository.claimNext(now, leaseFrom(now), MAX_ATTEMPTS),
      ),
    );

    const claimedIds = claims
      .filter((claim) => claim !== null)
      .map((claim) => claim.id);

    expect(claimedIds).toHaveLength(10);
    expect(new Set(claimedIds).size).toBe(10);
  });

  it('rolls an enqueue back with the surrounding transaction', async () => {
    await expect(
      transactionManager.runInTransaction(async () => {
        await enqueue('rolled-back@example.com');
        throw new Error('outer boom');
      }),
    ).rejects.toThrow('outer boom');

    await expect(
      dataSource.getRepository(EmailOutboxJobOrmEntity).count(),
    ).resolves.toBe(0);
  });

  it('prunes only jobs processed before the cutoff, never pending or in-flight ones', async () => {
    await enqueue('pending@example.com');
    await enqueue('processing@example.com');
    await enqueue('old-sent@example.com');
    await enqueue('recent-sent@example.com');

    const jobs = dataSource.getRepository(EmailOutboxJobOrmEntity);
    const cutoff = new Date();

    await jobs.update(
      { recipient: 'processing@example.com' },
      { status: EmailJobStatus.PROCESSING, lockedUntil: new Date(0) },
    );
    await jobs.update(
      { recipient: 'old-sent@example.com' },
      {
        status: EmailJobStatus.SENT,
        processedAt: new Date(cutoff.getTime() - MINUTE),
      },
    );
    await jobs.update(
      { recipient: 'recent-sent@example.com' },
      {
        status: EmailJobStatus.SENT,
        processedAt: new Date(cutoff.getTime() + MINUTE),
      },
    );

    await expect(repository.deleteProcessedBefore(cutoff, 100)).resolves.toBe(
      1,
    );

    const remaining = (await jobs.find()).map((job) => job.recipient).sort();

    expect(remaining).toEqual([
      'pending@example.com',
      'processing@example.com',
      'recent-sent@example.com',
    ]);
  });
});
