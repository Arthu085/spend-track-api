import type { Repository } from 'typeorm';
import { EmailType } from '@shared/domain/enums/email-type.enum';
import { EmailJobStatus } from '../../../../domain/enums/email-job-status.enum';
import type { ClaimedEmailJob } from '../../../../domain/repositories/email-outbox.repository';
import type { EmailOutboxJobOrmEntity } from '../../entities/email-outbox-job.orm-entity';
import { TypeOrmEmailOutboxRepository } from '../typeorm-email-outbox.repository';
import { mockOf } from '@test/support/mocks/mock-of';

const JOB: ClaimedEmailJob = {
  id: 7,
  uuid: 'job-uuid',
  emailType: EmailType.EMAIL_CONFIRMATION,
  recipient: 'jane@example.com',
  locale: 'en',
  attempts: 2,
};

function buildRepository(
  overrides: Partial<Repository<EmailOutboxJobOrmEntity>>,
) {
  return new TypeOrmEmailOutboxRepository(
    mockOf<Repository<EmailOutboxJobOrmEntity>>(overrides),
  );
}

describe('TypeOrmEmailOutboxRepository', () => {
  it('enqueues a PENDING job', async () => {
    const insert = jest.fn().mockResolvedValue(undefined);
    const availableAt = new Date();

    await buildRepository({ insert }).enqueue({
      emailType: EmailType.PASSWORD_RESET,
      recipient: 'jane@example.com',
      locale: 'pt-BR',
      availableAt,
    });

    expect(insert).toHaveBeenCalledWith({
      emailType: EmailType.PASSWORD_RESET,
      recipient: 'jane@example.com',
      locale: 'pt-BR',
      status: EmailJobStatus.PENDING,
      availableAt,
    });
  });

  it('maps the claimed row to a ClaimedEmailJob', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        id: JOB.id,
        uuid: JOB.uuid,
        email_type: JOB.emailType,
        recipient: JOB.recipient,
        locale: JOB.locale,
        attempts: JOB.attempts,
      },
    ]);

    const now = new Date();
    const leaseUntil = new Date(now.getTime() + 1000);

    await expect(
      buildRepository({ query }).claimNext(now, leaseUntil, 5),
    ).resolves.toEqual(JOB);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('SKIP LOCKED'), [
      now,
      leaseUntil,
      5,
    ]);
  });

  it('returns null when nothing is claimable', async () => {
    const query = jest.fn().mockResolvedValue([]);

    await expect(
      buildRepository({ query }).claimNext(new Date(), new Date(), 5),
    ).resolves.toBeNull();
  });

  it.each([
    [
      'markSent',
      (repository: TypeOrmEmailOutboxRepository, at: Date) =>
        repository.markSent(JOB, at),
      (at: Date) => ({
        status: EmailJobStatus.SENT,
        processedAt: at,
        lastError: null,
      }),
    ],
    [
      'scheduleRetry',
      (repository: TypeOrmEmailOutboxRepository, at: Date) =>
        repository.scheduleRetry(JOB, at, 'boom'),
      (at: Date) => ({
        status: EmailJobStatus.PENDING,
        availableAt: at,
        lastError: 'boom',
      }),
    ],
    [
      'markFailed',
      (repository: TypeOrmEmailOutboxRepository, at: Date) =>
        repository.markFailed(JOB, at, 'boom'),
      (at: Date) => ({
        status: EmailJobStatus.FAILED,
        processedAt: at,
        lastError: 'boom',
      }),
    ],
  ])(
    '%s only applies while the same attempt still holds the job, and releases the lease',
    async (_, transition, expectedChanges) => {
      const at = new Date();
      const update = jest.fn().mockResolvedValue({ affected: 1 });

      await expect(transition(buildRepository({ update }), at)).resolves.toBe(
        true,
      );

      expect(update).toHaveBeenCalledWith(
        {
          id: JOB.id,
          status: EmailJobStatus.PROCESSING,
          attempts: JOB.attempts,
        },
        { ...expectedChanges(at), lockedUntil: null },
      );
    },
  );

  it('reports a stale transition when no row matched', async () => {
    const update = jest.fn().mockResolvedValue({ affected: 0 });

    await expect(
      buildRepository({ update }).markSent(JOB, new Date()),
    ).resolves.toBe(false);
  });
});
