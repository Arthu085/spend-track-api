import type { EmailConfirmationTokenRepository } from '../../../domain/repositories/email-confirmation-token.repository';
import { CleanupEmailConfirmationTokensUseCase } from '../cleanup-email-confirmation-tokens.use-case';

describe('CleanupEmailConfirmationTokensUseCase', () => {
  const frozenNow = new Date('2026-07-29T12:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(frozenNow);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function buildUseCase(
    deleteExpiredBefore: jest.Mock,
  ): CleanupEmailConfirmationTokensUseCase {
    return new CleanupEmailConfirmationTokensUseCase({
      deleteExpiredBefore,
    } as unknown as EmailConfirmationTokenRepository);
  }

  it.each([
    [1, '2026-07-28T12:00:00.000Z'],
    [7, '2026-07-22T12:00:00.000Z'],
    [365, '2025-07-29T12:00:00.000Z'],
  ])(
    'deletes rows before now minus %p day(s)',
    async (retentionDays, expectedCutoff) => {
      const deleteExpiredBefore = jest.fn().mockResolvedValue(0);

      await buildUseCase(deleteExpiredBefore).execute({
        retentionDays,
        batchSize: 100,
      });

      expect(deleteExpiredBefore).toHaveBeenCalledWith(
        new Date(expectedCutoff),
        100,
      );
    },
  );

  it('repeats full batches with the same cutoff and returns the total deleted', async () => {
    const deleteExpiredBefore = jest
      .fn()
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);

    const deleted = await buildUseCase(deleteExpiredBefore).execute({
      retentionDays: 7,
      batchSize: 2,
    });

    expect(deleted).toBe(5);
    expect(deleteExpiredBefore).toHaveBeenCalledTimes(3);

    const cutoffs = deleteExpiredBefore.mock.calls.map(([cutoff]: [Date]) =>
      cutoff.getTime(),
    );

    expect(new Set(cutoffs).size).toBe(1);
  });

  it('propagates a repository failure', async () => {
    const deleteExpiredBefore = jest
      .fn()
      .mockRejectedValue(new Error('db down'));

    await expect(
      buildUseCase(deleteExpiredBefore).execute({
        retentionDays: 7,
        batchSize: 100,
      }),
    ).rejects.toThrow('db down');
  });
});
