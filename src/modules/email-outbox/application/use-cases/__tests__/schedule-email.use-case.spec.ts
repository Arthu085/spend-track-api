import { Logger } from '@nestjs/common';
import { EmailType } from '@shared/domain/enums/email-type.enum';
import type {
  EmailQuotaDecision,
  EmailQuotaPort,
  TransactionManagerPort,
} from '@shared/application/ports';
import type { EmailOutboxRepository } from '../../../domain/repositories/email-outbox.repository';
import type { RequestLocalePort } from '../../ports/request-locale.port';
import { ScheduleEmailUseCase } from '../schedule-email.use-case';
import { mockOf } from '@test/support/mocks/mock-of';

const ALLOWED: EmailQuotaDecision = { allowed: true, used: 1, limit: 5 };

function buildDeps(
  overrides: { tryConsume?: jest.Mock; enqueue?: jest.Mock } = {},
) {
  const tryConsume =
    overrides.tryConsume ?? jest.fn().mockResolvedValue(ALLOWED);

  const enqueue = overrides.enqueue ?? jest.fn().mockResolvedValue(undefined);

  const runInSavepoint = jest
    .fn()
    .mockImplementation((work: () => Promise<unknown>) => work());

  const useCase = new ScheduleEmailUseCase(
    mockOf<EmailQuotaPort>({ tryConsume }),
    mockOf<EmailOutboxRepository>({ enqueue }),
    mockOf<TransactionManagerPort>({ runInSavepoint }),
    mockOf<RequestLocalePort>({ current: () => 'en' }),
  );

  return { useCase, tryConsume, enqueue, runInSavepoint };
}

describe('ScheduleEmailUseCase', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('consumes a quota slot and enqueues one job for the normalized recipient in the request locale', async () => {
    const { useCase, tryConsume, enqueue } = buildDeps();

    const before = Date.now();

    await expect(
      useCase.schedule({
        emailType: EmailType.PASSWORD_RESET,
        recipient: '  Jane@Example.COM ',
      }),
    ).resolves.toEqual({ scheduled: true });

    expect(tryConsume).toHaveBeenCalledWith({
      emailType: EmailType.PASSWORD_RESET,
      recipient: 'jane@example.com',
    });
    expect(enqueue).toHaveBeenCalledTimes(1);

    const [job] = enqueue.mock.calls[0] as [
      { recipient: string; locale: string; availableAt: Date },
    ];

    expect(job).toMatchObject({
      emailType: EmailType.PASSWORD_RESET,
      recipient: 'jane@example.com',
      locale: 'en',
    });
    expect(job.availableAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('consumes the slot and enqueues only inside the savepoint work, so they commit or roll back together', async () => {
    const { useCase, runInSavepoint, tryConsume, enqueue } = buildDeps();

    runInSavepoint.mockResolvedValueOnce({ scheduled: true });

    await useCase.schedule({
      emailType: EmailType.EMAIL_CONFIRMATION,
      recipient: 'jane@example.com',
    });

    expect(runInSavepoint).toHaveBeenCalledTimes(1);
    expect(tryConsume).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it.each(['DISABLED', 'EXHAUSTED', 'UNAVAILABLE'] as const)(
    'enqueues nothing and reports the %s denial',
    async (reason) => {
      const { useCase, enqueue } = buildDeps({
        tryConsume: jest
          .fn()
          .mockResolvedValue({ allowed: false, reason, used: 0, limit: 5 }),
      });

      await expect(
        useCase.schedule({
          emailType: EmailType.PASSWORD_RESET,
          recipient: 'jane@example.com',
        }),
      ).resolves.toEqual({ scheduled: false, reason });

      expect(enqueue).not.toHaveBeenCalled();
    },
  );

  it('reports UNAVAILABLE without throwing when the enqueue fails, and logs a masked recipient', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    const { useCase } = buildDeps({
      enqueue: jest
        .fn()
        .mockRejectedValue(new Error('insert failed for jane@example.com')),
    });

    await expect(
      useCase.schedule({
        emailType: EmailType.PASSWORD_RESET,
        recipient: 'jane@example.com',
      }),
    ).resolves.toEqual({ scheduled: false, reason: 'UNAVAILABLE' });

    expect(errorSpy).toHaveBeenCalledWith({
      msg: 'Failed to schedule email',
      emailType: EmailType.PASSWORD_RESET,
      recipient: 'j***@example.com',
      error: 'insert failed for j***@example.com',
    });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(
      'jane@example.com',
    );
  });

  it('reports UNAVAILABLE without throwing when the savepoint itself cannot be opened', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();

    const useCase = new ScheduleEmailUseCase(
      mockOf<EmailQuotaPort>({ tryConsume: jest.fn() }),
      mockOf<EmailOutboxRepository>({ enqueue: jest.fn() }),
      mockOf<TransactionManagerPort>({
        runInSavepoint: jest.fn().mockRejectedValue(new Error('db down')),
      }),
      mockOf<RequestLocalePort>({ current: () => 'pt-BR' }),
    );

    await expect(
      useCase.schedule({
        emailType: EmailType.EMAIL_CONFIRMATION,
        recipient: 'jane@example.com',
      }),
    ).resolves.toEqual({ scheduled: false, reason: 'UNAVAILABLE' });
  });
});
