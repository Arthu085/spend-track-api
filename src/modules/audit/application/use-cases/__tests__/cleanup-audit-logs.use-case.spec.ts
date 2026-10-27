import type { AuditLogRepository } from '../../../domain/repositories/audit-log.repository';
import { CleanupAuditLogsUseCase } from '../cleanup-audit-logs.use-case';

describe('CleanupAuditLogsUseCase', () => {
  const frozenNow = new Date('2026-07-29T12:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(frozenNow);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function buildUseCase(
    deleteCreatedBefore: jest.Mock,
  ): CleanupAuditLogsUseCase {
    return new CleanupAuditLogsUseCase({
      deleteCreatedBefore,
    } as unknown as AuditLogRepository);
  }

  it.each([
    [1, '2026-07-28T12:00:00.000Z'],
    [7, '2026-07-22T12:00:00.000Z'],
    [365, '2025-07-29T12:00:00.000Z'],
  ])(
    'deletes rows before now minus %p day(s)',
    async (retentionDays, expectedCutoff) => {
      const deleteCreatedBefore = jest.fn().mockResolvedValue(0);

      await buildUseCase(deleteCreatedBefore).execute({
        retentionDays,
        batchSize: 100,
      });

      expect(deleteCreatedBefore).toHaveBeenCalledWith(
        new Date(expectedCutoff),
        100,
      );
    },
  );

  it('repeats full batches with the same cutoff and returns the total deleted', async () => {
    const deleteCreatedBefore = jest
      .fn()
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);

    const deleted = await buildUseCase(deleteCreatedBefore).execute({
      retentionDays: 7,
      batchSize: 2,
    });

    expect(deleted).toBe(5);
    expect(deleteCreatedBefore).toHaveBeenCalledTimes(3);

    const cutoffs = deleteCreatedBefore.mock.calls.map(([cutoff]: [Date]) =>
      cutoff.getTime(),
    );

    expect(new Set(cutoffs).size).toBe(1);
  });

  it('propagates a repository failure', async () => {
    const deleteCreatedBefore = jest
      .fn()
      .mockRejectedValue(new Error('db down'));

    await expect(
      buildUseCase(deleteCreatedBefore).execute({
        retentionDays: 7,
        batchSize: 100,
      }),
    ).rejects.toThrow('db down');
  });
});
