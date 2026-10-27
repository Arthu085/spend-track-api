import { Logger } from '@nestjs/common';
import type { AppConfigService } from '@core/config';
import type {
  DispatchEmailOutboxOptions,
  DispatchEmailOutboxUseCase,
} from '../../../application/use-cases/dispatch-email-outbox.use-case';
import { EmailOutboxWorker } from '../email-outbox.worker';
import { mockOf } from '@test/support/mocks/mock-of';

const EMPTY_SUMMARY = { sent: 0, retried: 0, failed: 0 };

function buildWorker(
  execute: jest.Mock,
  options: { workerEnabled?: boolean; pollIntervalMs?: number } = {},
): EmailOutboxWorker {
  return new EmailOutboxWorker(
    mockOf<DispatchEmailOutboxUseCase>({ execute }),
    mockOf<AppConfigService>({
      emailOutbox: {
        workerEnabled: options.workerEnabled ?? true,
        pollIntervalMs: options.pollIntervalMs ?? 1000,
        maxAttempts: 5,
        retryBaseDelayMs: 60_000,
      },
    }),
  );
}

describe('EmailOutboxWorker', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('dispatches once on bootstrap, so jobs left by a previous process are picked up, then on every interval', async () => {
    const execute = jest.fn().mockResolvedValue(EMPTY_SUMMARY);
    const worker = buildWorker(execute, { pollIntervalMs: 1000 });

    worker.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(0);

    expect(execute).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(2000);

    expect(execute).toHaveBeenCalledTimes(3);

    await worker.onModuleDestroy();
  });

  it('never starts when disabled', async () => {
    const execute = jest.fn().mockResolvedValue(EMPTY_SUMMARY);
    const worker = buildWorker(execute, { workerEnabled: false });

    worker.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(5000);

    expect(execute).not.toHaveBeenCalled();
  });

  it('skips a tick while the previous dispatch is still running', async () => {
    let finish: () => void = () => undefined;

    const execute = jest.fn(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(EMPTY_SUMMARY);
        }),
    );

    const worker = buildWorker(execute);

    const first = worker.tick();
    const second = worker.tick();

    expect(second).toBe(first);
    expect(execute).toHaveBeenCalledTimes(1);

    finish();
    await first;
  });

  it('logs a non-empty summary', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const summary = { sent: 2, retried: 1, failed: 0 };
    const worker = buildWorker(jest.fn().mockResolvedValue(summary));

    await worker.tick();

    expect(logSpy).toHaveBeenCalledWith({
      msg: 'Email outbox dispatched',
      ...summary,
    });
  });

  it('logs and swallows a failed run', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const worker = buildWorker(jest.fn().mockRejectedValue(new Error('down')));

    await expect(worker.tick()).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith({
      msg: 'Email outbox dispatch failed',
      error: 'down',
    });
  });

  it('on shutdown stops polling, asks the running dispatch to stop claiming, and waits for it', async () => {
    let shouldStop: (() => boolean) | undefined;
    let finish: () => void = () => undefined;

    const execute = jest.fn((options: DispatchEmailOutboxOptions) => {
      shouldStop = options.shouldStop;

      return new Promise((resolve) => {
        finish = () => resolve(EMPTY_SUMMARY);
      });
    });

    const worker = buildWorker(execute, { pollIntervalMs: 1000 });

    worker.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(0);

    let destroyed = false;

    const destroying = worker.onModuleDestroy().then(() => {
      destroyed = true;
    });

    await jest.advanceTimersByTimeAsync(0);

    expect(shouldStop?.()).toBe(true);
    expect(destroyed).toBe(false);

    finish();
    await destroying;

    expect(destroyed).toBe(true);

    await jest.advanceTimersByTimeAsync(5000);

    expect(execute).toHaveBeenCalledTimes(1);
    await expect(worker.tick()).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
