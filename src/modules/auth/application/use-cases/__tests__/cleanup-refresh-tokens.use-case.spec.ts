import type { RefreshTokenRepository } from '../../../domain/repositories/refresh-token.repository';
import { CleanupRefreshTokensUseCase } from '../cleanup-refresh-tokens.use-case';

describe('CleanupRefreshTokensUseCase', () => {
  const frozenNow = new Date('2026-07-29T12:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(frozenNow);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('calls deleteExpiredBefore with the current date', async () => {
    const deleteExpiredBefore = jest.fn().mockResolvedValue(0);
    const deleteRevokedBefore = jest.fn().mockResolvedValue(0);

    const refreshTokenRepository = {
      deleteExpiredBefore,
      deleteRevokedBefore,
    } as unknown as RefreshTokenRepository;

    const useCase = new CleanupRefreshTokensUseCase(refreshTokenRepository);

    await useCase.execute({ retentionDays: 30 });

    expect(deleteExpiredBefore).toHaveBeenCalledWith(frozenNow);
  });

  it('calls deleteRevokedBefore with now minus 30 days when retentionDays is 30', async () => {
    const deleteExpiredBefore = jest.fn().mockResolvedValue(0);
    const deleteRevokedBefore = jest.fn().mockResolvedValue(0);

    const refreshTokenRepository = {
      deleteExpiredBefore,
      deleteRevokedBefore,
    } as unknown as RefreshTokenRepository;

    const useCase = new CleanupRefreshTokensUseCase(refreshTokenRepository);

    await useCase.execute({ retentionDays: 30 });

    const expectedThreshold = new Date(
      frozenNow.getTime() - 30 * 24 * 60 * 60 * 1000,
    );

    expect(deleteRevokedBefore).toHaveBeenCalledWith(expectedThreshold);
  });

  it('calls deleteRevokedBefore with now minus 7 days when retentionDays is 7', async () => {
    const deleteExpiredBefore = jest.fn().mockResolvedValue(0);
    const deleteRevokedBefore = jest.fn().mockResolvedValue(0);

    const refreshTokenRepository = {
      deleteExpiredBefore,
      deleteRevokedBefore,
    } as unknown as RefreshTokenRepository;

    const useCase = new CleanupRefreshTokensUseCase(refreshTokenRepository);

    await useCase.execute({ retentionDays: 7 });

    const expectedThreshold = new Date(
      frozenNow.getTime() - 7 * 24 * 60 * 60 * 1000,
    );

    expect(deleteRevokedBefore).toHaveBeenCalledWith(expectedThreshold);
  });

  it('returns the combined deletion counts', async () => {
    const deleteExpiredBefore = jest.fn().mockResolvedValue(3);
    const deleteRevokedBefore = jest.fn().mockResolvedValue(2);

    const refreshTokenRepository = {
      deleteExpiredBefore,
      deleteRevokedBefore,
    } as unknown as RefreshTokenRepository;

    const useCase = new CleanupRefreshTokensUseCase(refreshTokenRepository);

    const result = await useCase.execute({ retentionDays: 30 });

    expect(result).toEqual({
      expiredDeleted: 3,
      revokedDeleted: 2,
      totalDeleted: 5,
    });
  });

  it('runs the expired pass before the revoked pass', async () => {
    const deleteExpiredBefore = jest.fn().mockResolvedValue(0);
    const deleteRevokedBefore = jest.fn().mockResolvedValue(0);

    const refreshTokenRepository = {
      deleteExpiredBefore,
      deleteRevokedBefore,
    } as unknown as RefreshTokenRepository;

    const useCase = new CleanupRefreshTokensUseCase(refreshTokenRepository);

    await useCase.execute({ retentionDays: 30 });

    expect(deleteExpiredBefore.mock.invocationCallOrder[0]).toBeLessThan(
      deleteRevokedBefore.mock.invocationCallOrder[0],
    );
  });

  it('propagates a rejection from deleteExpiredBefore instead of swallowing it', async () => {
    const deleteExpiredBefore = jest
      .fn()
      .mockRejectedValue(new Error('db down'));

    const deleteRevokedBefore = jest.fn().mockResolvedValue(0);

    const refreshTokenRepository = {
      deleteExpiredBefore,
      deleteRevokedBefore,
    } as unknown as RefreshTokenRepository;

    const useCase = new CleanupRefreshTokensUseCase(refreshTokenRepository);

    await expect(useCase.execute({ retentionDays: 30 })).rejects.toThrow(
      'db down',
    );
    expect(deleteRevokedBefore).not.toHaveBeenCalled();
  });
});
