import { Logger } from '@nestjs/common';
import type { AppConfigService } from '@core/config';
import type { CleanupEmailOutboxUseCase } from '../../../application/use-cases/cleanup-email-outbox.use-case';
import { EmailOutboxCleanupScheduler } from '../email-outbox-cleanup.scheduler';
import { mockOf } from '@test/support/mocks/mock-of';

function buildScheduler(
  execute: jest.Mock,
  emailOutboxDays = 3,
): EmailOutboxCleanupScheduler {
  return new EmailOutboxCleanupScheduler(
    mockOf<CleanupEmailOutboxUseCase>({ execute }),
    mockOf<AppConfigService>({
      retentionCleanup: {
        passwordResetTokenDays: 7,
        emailConfirmationTokenDays: 7,
        emailSendLogDays: 30,
        emailOutboxDays,
        auditLogDays: 365,
        batchSize: 500,
      },
    }),
  );
}

describe('EmailOutboxCleanupScheduler', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('skips the cleanup when the retention days are 0', async () => {
    const execute = jest.fn();

    await buildScheduler(execute, 0).handleCleanup();

    expect(execute).not.toHaveBeenCalled();
  });

  it('passes the configured retention days and batch size through and logs the deleted count', async () => {
    const execute = jest.fn().mockResolvedValue(4);
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();

    await buildScheduler(execute).handleCleanup();

    expect(execute).toHaveBeenCalledWith({ retentionDays: 3, batchSize: 500 });
    expect(logSpy).toHaveBeenCalledWith(
      'Email outbox cleanup deleted 4 job(s) processed more than 3 day(s) ago',
    );
  });

  it('swallows and logs a failure without crashing', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('db down'));
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    await expect(
      buildScheduler(execute).handleCleanup(),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith({
      msg: 'Email outbox cleanup failed',
      error: 'db down',
    });
  });
});
