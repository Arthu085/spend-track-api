import { Logger } from '@nestjs/common';
import type { AppConfigService } from '@core/config';
import { EmailType } from '@shared/domain/enums/email-type.enum';
import type { EmailJobHandler } from '@shared/application/ports';
import type {
  ClaimedEmailJob,
  EmailOutboxRepository,
} from '../../../domain/repositories/email-outbox.repository';
import { EmailJobHandlers } from '../../services/email-job-handlers.service';
import {
  DISPATCH_BATCH_SIZE,
  DISPATCH_LEASE_MS,
  DispatchEmailOutboxUseCase,
  LEASE_EXPIRED_ON_FINAL_ATTEMPT,
  MAX_RETRY_DELAY_MS,
} from '../dispatch-email-outbox.use-case';
import { mockOf } from '@test/support/mocks/mock-of';

const NOW = new Date('2026-10-08T12:00:00.000Z');

function buildJob(overrides: Partial<ClaimedEmailJob> = {}): ClaimedEmailJob {
  return {
    id: 1,
    uuid: 'job-uuid',
    emailType: EmailType.PASSWORD_RESET,
    recipient: 'jane@example.com',
    locale: 'en',
    attempts: 1,
    ...overrides,
  };
}

function buildDeps(
  options: {
    jobs?: ClaimedEmailJob[];
    handle?: jest.Mock;
    maxAttempts?: number;
    registerHandler?: boolean;
    transitionApplies?: boolean;
  } = {},
) {
  const queue = [...(options.jobs ?? [buildJob()])];
  const claimNext = jest.fn(() => Promise.resolve(queue.shift() ?? null));
  const transitionApplies = options.transitionApplies ?? true;
  const markSent = jest.fn().mockResolvedValue(transitionApplies);
  const scheduleRetry = jest.fn().mockResolvedValue(transitionApplies);
  const markFailed = jest.fn().mockResolvedValue(transitionApplies);

  const failExpiredFinalAttempts = jest.fn().mockResolvedValue(0);

  const repository = mockOf<EmailOutboxRepository>({
    failExpiredFinalAttempts,
    claimNext,
    markSent,
    scheduleRetry,
    markFailed,
  });

  const handle = options.handle ?? jest.fn().mockResolvedValue(undefined);
  const handlers = new EmailJobHandlers();

  if (options.registerHandler ?? true) {
    handlers.register(
      EmailType.PASSWORD_RESET,
      mockOf<EmailJobHandler>({ handle }),
    );
  }

  const config = mockOf<AppConfigService>({
    emailOutbox: {
      workerEnabled: true,
      pollIntervalMs: 5000,
      maxAttempts: options.maxAttempts ?? 3,
      retryBaseDelayMs: 60_000,
    },
  });

  const useCase = new DispatchEmailOutboxUseCase(repository, handlers, config);

  return {
    useCase,
    failExpiredFinalAttempts,
    claimNext,
    markSent,
    scheduleRetry,
    markFailed,
    handle,
  };
}

describe('DispatchEmailOutboxUseCase', () => {
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('claims with a lease, hands the job to its handler, and marks it SENT', async () => {
    const job = buildJob();

    const { useCase, claimNext, handle, markSent } = buildDeps({
      jobs: [job],
    });

    await expect(useCase.execute()).resolves.toEqual({
      sent: 1,
      retried: 0,
      failed: 0,
    });

    expect(claimNext).toHaveBeenCalledWith(
      NOW,
      new Date(NOW.getTime() + DISPATCH_LEASE_MS),
      3,
    );
    expect(handle).toHaveBeenCalledWith({
      uuid: job.uuid,
      emailType: job.emailType,
      recipient: job.recipient,
      locale: job.locale,
      attempt: job.attempts,
    });
    expect(markSent).toHaveBeenCalledWith(job, NOW);
  });

  it('fails jobs whose lease expired during their final attempt before claiming, and counts them', async () => {
    const { useCase, failExpiredFinalAttempts } = buildDeps({ jobs: [] });

    failExpiredFinalAttempts.mockResolvedValueOnce(2);

    await expect(useCase.execute()).resolves.toEqual({
      sent: 0,
      retried: 0,
      failed: 2,
    });
    expect(failExpiredFinalAttempts).toHaveBeenCalledWith(
      NOW,
      3,
      LEASE_EXPIRED_ON_FINAL_ATTEMPT,
    );
    expect(errorSpy).toHaveBeenCalledWith({
      msg: 'Email jobs failed permanently: lease expired during the final attempt',
      count: 2,
    });
  });

  it('stops when the queue is empty', async () => {
    const { useCase, claimNext } = buildDeps({ jobs: [] });

    await expect(useCase.execute()).resolves.toEqual({
      sent: 0,
      retried: 0,
      failed: 0,
    });
    expect(claimNext).toHaveBeenCalledTimes(1);
  });

  it(`claims at most ${DISPATCH_BATCH_SIZE} jobs per run`, async () => {
    const jobs = Array.from({ length: DISPATCH_BATCH_SIZE + 5 }, (_, index) =>
      buildJob({ id: index + 1 }),
    );

    const { useCase, claimNext } = buildDeps({ jobs });

    const summary = await useCase.execute();

    expect(summary.sent).toBe(DISPATCH_BATCH_SIZE);
    expect(claimNext).toHaveBeenCalledTimes(DISPATCH_BATCH_SIZE);
  });

  it('stops claiming as soon as shouldStop reports true', async () => {
    const { useCase, claimNext } = buildDeps({
      jobs: [buildJob({ id: 1 }), buildJob({ id: 2 })],
    });

    let calls = 0;

    const summary = await useCase.execute({ shouldStop: () => ++calls > 1 });

    expect(summary.sent).toBe(1);
    expect(claimNext).toHaveBeenCalledTimes(1);
  });

  it('reschedules a failed attempt with exponential backoff and a masked error', async () => {
    const job = buildJob({ attempts: 2 });

    const { useCase, scheduleRetry, markSent } = buildDeps({
      jobs: [job],
      handle: jest
        .fn()
        .mockRejectedValue(new Error('550 rejected jane@example.com')),
    });

    await expect(useCase.execute()).resolves.toEqual({
      sent: 0,
      retried: 1,
      failed: 0,
    });

    expect(markSent).not.toHaveBeenCalled();
    expect(scheduleRetry).toHaveBeenCalledWith(
      job,
      new Date(NOW.getTime() + 120_000),
      '550 rejected j***@example.com',
    );
    expect(warnSpy).toHaveBeenCalledWith({
      msg: 'Email job attempt failed; retry scheduled',
      jobId: job.uuid,
      emailType: job.emailType,
      attempts: 2,
      retryAt: new Date(NOW.getTime() + 120_000).toISOString(),
      error: '550 rejected j***@example.com',
    });
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(
      'jane@example.com',
    );
  });

  it('caps the retry delay', async () => {
    const { useCase, scheduleRetry } = buildDeps({
      jobs: [buildJob({ attempts: 15 })],
      maxAttempts: 20,
      handle: jest.fn().mockRejectedValue(new Error('timeout')),
    });

    await useCase.execute();

    const [, retryAt] = scheduleRetry.mock.calls[0] as [unknown, Date];

    expect(retryAt.getTime() - NOW.getTime()).toBe(MAX_RETRY_DELAY_MS);
  });

  it('marks the job FAILED once the last allowed attempt fails', async () => {
    const job = buildJob({ attempts: 3 });

    const { useCase, markFailed, scheduleRetry } = buildDeps({
      jobs: [job],
      maxAttempts: 3,
      handle: jest.fn().mockRejectedValue(new Error('smtp down')),
    });

    await expect(useCase.execute()).resolves.toEqual({
      sent: 0,
      retried: 0,
      failed: 1,
    });

    expect(scheduleRetry).not.toHaveBeenCalled();
    expect(markFailed).toHaveBeenCalledWith(job, NOW, 'smtp down');
    expect(errorSpy).toHaveBeenCalledWith({
      msg: 'Email job failed permanently',
      jobId: job.uuid,
      emailType: job.emailType,
      attempts: 3,
      error: 'smtp down',
    });
  });

  it('treats a job with no registered handler as a failed attempt', async () => {
    const { useCase, scheduleRetry } = buildDeps({ registerHandler: false });

    await useCase.execute();

    expect(scheduleRetry).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Date),
      `No email job handler registered for ${EmailType.PASSWORD_RESET}`,
    );
  });

  it('truncates a long error message before storing it', async () => {
    const { useCase, scheduleRetry } = buildDeps({
      handle: jest.fn().mockRejectedValue(new Error('x'.repeat(5000))),
    });

    await useCase.execute();

    const [, , error] = scheduleRetry.mock.calls[0] as [unknown, Date, string];

    expect(error).toHaveLength(1000);
  });

  it.each([
    ['delivery succeeded', undefined],
    ['retry', new Error('timeout')],
  ])(
    'logs and discards the outcome (%s) when another run reclaimed the job first',
    async (_, failure) => {
      const job = buildJob();

      const { useCase } = buildDeps({
        jobs: [job],
        transitionApplies: false,
        handle: failure
          ? jest.fn().mockRejectedValue(failure)
          : jest.fn().mockResolvedValue(undefined),
      });

      await useCase.execute();

      expect(warnSpy).toHaveBeenCalledWith({
        msg: 'Email job lease lost before completion; outcome discarded',
        jobId: job.uuid,
        emailType: job.emailType,
        attempts: job.attempts,
      });
    },
  );

  it('logs a lost lease when marking a permanently failed job', async () => {
    const { useCase } = buildDeps({
      jobs: [buildJob({ attempts: 3 })],
      transitionApplies: false,
      handle: jest.fn().mockRejectedValue(new Error('smtp down')),
    });

    await useCase.execute();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: 'Email job lease lost before completion; outcome discarded',
      }),
    );
  });

  it('propagates a repository failure so the worker logs the run as failed', async () => {
    const { useCase, claimNext } = buildDeps();

    claimNext.mockRejectedValueOnce(new Error('db down'));

    await expect(useCase.execute()).rejects.toThrow('db down');
  });
});
