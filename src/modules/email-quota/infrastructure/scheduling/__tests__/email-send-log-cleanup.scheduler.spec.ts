import { Logger } from '@nestjs/common';
import type { AppConfigService } from '@core/config';
import type { CleanupEmailSendLogsUseCase } from '../../../application/use-cases/cleanup-email-send-logs.use-case';
import { EmailSendLogCleanupScheduler } from '../email-send-log-cleanup.scheduler';

function buildScheduler(
  execute: jest.Mock,
  emailSendLogDays = 14,
): EmailSendLogCleanupScheduler {
  const config = {
    retentionCleanup: { emailSendLogDays, batchSize: 500 },
  };

  return new EmailSendLogCleanupScheduler(
    { execute } as unknown as CleanupEmailSendLogsUseCase,
    config as unknown as AppConfigService,
  );
}

describe('EmailSendLogCleanupScheduler', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('skips the cleanup when the retention days are 0', async () => {
    const execute = jest.fn();

    await buildScheduler(execute, 0).handleCleanup();

    expect(execute).not.toHaveBeenCalled();
  });

  it('passes the configured retention days and batch size through to the use-case', async () => {
    const execute = jest.fn().mockResolvedValue(0);

    jest.spyOn(Logger.prototype, 'log').mockImplementation();

    await buildScheduler(execute).handleCleanup();

    expect(execute).toHaveBeenCalledWith({ retentionDays: 14, batchSize: 500 });
  });

  it('logs the deleted count and retention days', async () => {
    const execute = jest.fn().mockResolvedValue(42);
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();

    await buildScheduler(execute).handleCleanup();

    expect(logSpy).toHaveBeenCalledWith(
      'Email send log cleanup deleted 42 row(s) created more than 14 day(s) ago',
    );
  });

  it('swallows an Error rejection and logs the failure without crashing', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('db down'));
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    await expect(
      buildScheduler(execute).handleCleanup(),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith({
      msg: 'Email send log cleanup failed',
      error: 'db down',
    });
  });

  it('swallows a non-Error rejection and logs it via String(error)', async () => {
    const execute = jest.fn().mockRejectedValue('unexpected failure');
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    await expect(
      buildScheduler(execute).handleCleanup(),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith({
      msg: 'Email send log cleanup failed',
      error: 'unexpected failure',
    });
  });
});
