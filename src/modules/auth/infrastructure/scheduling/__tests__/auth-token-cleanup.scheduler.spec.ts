import { Logger } from '@nestjs/common';
import type { AppConfigService } from '@core/config';
import type { CleanupPasswordResetTokensUseCase } from '../../../application/use-cases/cleanup-password-reset-tokens.use-case';
import type {
  CleanupRefreshTokensResult,
  CleanupRefreshTokensUseCase,
} from '../../../application/use-cases/cleanup-refresh-tokens.use-case';
import { AuthTokenCleanupScheduler } from '../auth-token-cleanup.scheduler';

interface FakeConfig {
  refreshTokenCleanup: { retentionDays: number };
  retentionCleanup: { passwordResetTokenDays: number; batchSize: number };
}

interface BuildOptions {
  refreshRetentionDays?: number;
  passwordResetRetentionDays?: number;
  batchSize?: number;
  refreshExecute?: jest.Mock;
  passwordResetExecute?: jest.Mock;
}

const emptyRefreshResult: CleanupRefreshTokensResult = {
  expiredDeleted: 0,
  revokedDeleted: 0,
  totalDeleted: 0,
};

function buildScheduler(options: BuildOptions = {}) {
  const refreshExecute =
    options.refreshExecute ?? jest.fn().mockResolvedValue(emptyRefreshResult);

  const passwordResetExecute =
    options.passwordResetExecute ?? jest.fn().mockResolvedValue(0);

  const config: FakeConfig = {
    refreshTokenCleanup: { retentionDays: options.refreshRetentionDays ?? 30 },
    retentionCleanup: {
      passwordResetTokenDays: options.passwordResetRetentionDays ?? 7,
      batchSize: options.batchSize ?? 1000,
    },
  };

  const scheduler = new AuthTokenCleanupScheduler(
    { execute: refreshExecute } as unknown as CleanupRefreshTokensUseCase,
    {
      execute: passwordResetExecute,
    } as unknown as CleanupPasswordResetTokensUseCase,
    config as unknown as AppConfigService,
  );

  return { scheduler, refreshExecute, passwordResetExecute };
}

describe('AuthTokenCleanupScheduler', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('refresh tokens', () => {
    it('skips the pass when the retention days are 0 and still runs the password reset pass', async () => {
      const { scheduler, refreshExecute, passwordResetExecute } =
        buildScheduler({ refreshRetentionDays: 0 });

      jest.spyOn(Logger.prototype, 'log').mockImplementation();

      await scheduler.handleCleanup();

      expect(refreshExecute).not.toHaveBeenCalled();
      expect(passwordResetExecute).toHaveBeenCalledTimes(1);
    });

    it.each([30, 7])(
      'passes the configured retention days (%p) through to the use-case',
      async (retentionDays) => {
        const { scheduler, refreshExecute } = buildScheduler({
          refreshRetentionDays: retentionDays,
        });

        jest.spyOn(Logger.prototype, 'log').mockImplementation();

        await scheduler.handleCleanup();

        expect(refreshExecute).toHaveBeenCalledWith({ retentionDays });
      },
    );

    it('logs a success message with total/expired/revoked counts and retention days', async () => {
      const { scheduler } = buildScheduler({
        refreshExecute: jest.fn().mockResolvedValue({
          expiredDeleted: 4,
          revokedDeleted: 6,
          totalDeleted: 10,
        } satisfies CleanupRefreshTokensResult),
      });

      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();

      await scheduler.handleCleanup();

      const [message] = logSpy.mock.calls[0] as [string];

      expect(message).toContain('Refresh token cleanup deleted 10 row(s)');
      expect(message).toContain('4 expired');
      expect(message).toContain('6 revoked');
      expect(message).toContain('30 day(s)');
    });

    it('swallows an Error rejection and still runs the password reset pass', async () => {
      const { scheduler, passwordResetExecute } = buildScheduler({
        refreshExecute: jest.fn().mockRejectedValue(new Error('db down')),
      });

      jest.spyOn(Logger.prototype, 'log').mockImplementation();

      const errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();

      await expect(scheduler.handleCleanup()).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith({
        msg: 'Refresh token cleanup failed',
        error: 'db down',
      });
      expect(passwordResetExecute).toHaveBeenCalledTimes(1);
    });

    it('swallows a non-Error rejection and logs it via String(error)', async () => {
      const { scheduler } = buildScheduler({
        refreshExecute: jest.fn().mockRejectedValue('unexpected failure'),
      });

      jest.spyOn(Logger.prototype, 'log').mockImplementation();

      const errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();

      await expect(scheduler.handleCleanup()).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith({
        msg: 'Refresh token cleanup failed',
        error: 'unexpected failure',
      });
    });

    it('never logs raw token/hash values', async () => {
      const { scheduler } = buildScheduler({
        refreshExecute: jest.fn().mockResolvedValue({
          expiredDeleted: 1,
          revokedDeleted: 1,
          totalDeleted: 2,
        } satisfies CleanupRefreshTokensResult),
      });

      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();

      await scheduler.handleCleanup();

      for (const [message] of logSpy.mock.calls as Array<[string]>) {
        expect(message).not.toContain('hashed-token');
        expect(message).not.toMatch(/[A-Za-z0-9+/]{32,}={0,2}/);
      }
    });
  });

  describe('password reset tokens', () => {
    it('skips the pass when the retention days are 0 and still runs the refresh token pass', async () => {
      const { scheduler, refreshExecute, passwordResetExecute } =
        buildScheduler({ passwordResetRetentionDays: 0 });

      jest.spyOn(Logger.prototype, 'log').mockImplementation();

      await scheduler.handleCleanup();

      expect(passwordResetExecute).not.toHaveBeenCalled();
      expect(refreshExecute).toHaveBeenCalledTimes(1);
    });

    it('passes the configured retention days and batch size through to the use-case', async () => {
      const { scheduler, passwordResetExecute } = buildScheduler({
        passwordResetRetentionDays: 3,
        batchSize: 250,
      });

      jest.spyOn(Logger.prototype, 'log').mockImplementation();

      await scheduler.handleCleanup();

      expect(passwordResetExecute).toHaveBeenCalledWith({
        retentionDays: 3,
        batchSize: 250,
      });
    });

    it('runs after the refresh token pass', async () => {
      const { scheduler, refreshExecute, passwordResetExecute } =
        buildScheduler();

      jest.spyOn(Logger.prototype, 'log').mockImplementation();

      await scheduler.handleCleanup();

      expect(refreshExecute.mock.invocationCallOrder[0]).toBeLessThan(
        passwordResetExecute.mock.invocationCallOrder[0],
      );
    });

    it('logs the deleted count and retention days', async () => {
      const { scheduler } = buildScheduler({
        passwordResetExecute: jest.fn().mockResolvedValue(12),
      });

      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();

      await scheduler.handleCleanup();

      expect(logSpy).toHaveBeenCalledTimes(2);

      const [message] = logSpy.mock.calls[1] as [string];

      expect(message).toBe(
        'Password reset token cleanup deleted 12 row(s) expired more than 7 day(s) ago',
      );
    });

    it('swallows a rejection and logs the failure without crashing', async () => {
      const { scheduler } = buildScheduler({
        passwordResetExecute: jest.fn().mockRejectedValue(new Error('db down')),
      });

      jest.spyOn(Logger.prototype, 'log').mockImplementation();

      const errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();

      await expect(scheduler.handleCleanup()).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith({
        msg: 'Password reset token cleanup failed',
        error: 'db down',
      });
    });
  });
});
