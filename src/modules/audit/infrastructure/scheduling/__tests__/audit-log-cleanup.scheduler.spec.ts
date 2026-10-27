import { Logger } from '@nestjs/common';
import type { AppConfigService } from '@core/config';
import type { CleanupAuditLogsUseCase } from '../../../application/use-cases/cleanup-audit-logs.use-case';
import { AuditLogCleanupScheduler } from '../audit-log-cleanup.scheduler';

function buildScheduler(
  execute: jest.Mock,
  auditLogDays = 14,
): AuditLogCleanupScheduler {
  const config = {
    retentionCleanup: { auditLogDays, batchSize: 500 },
  };

  return new AuditLogCleanupScheduler(
    { execute } as unknown as CleanupAuditLogsUseCase,
    config as unknown as AppConfigService,
  );
}

describe('AuditLogCleanupScheduler', () => {
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
      'Audit log cleanup deleted 42 row(s) created more than 14 day(s) ago',
    );
  });

  it('swallows an Error rejection and logs the failure without crashing', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('db down'));
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    await expect(
      buildScheduler(execute).handleCleanup(),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith({
      msg: 'Audit log cleanup failed',
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
      msg: 'Audit log cleanup failed',
      error: 'unexpected failure',
    });
  });
});
