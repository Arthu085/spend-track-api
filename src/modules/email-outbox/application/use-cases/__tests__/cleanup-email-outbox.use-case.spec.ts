import type { EmailOutboxRepository } from '../../../domain/repositories/email-outbox.repository';
import { CleanupEmailOutboxUseCase } from '../cleanup-email-outbox.use-case';
import { mockOf } from '@test/support/mocks/mock-of';

describe('CleanupEmailOutboxUseCase', () => {
  const frozenNow = new Date('2026-10-08T12:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(frozenNow);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('deletes processed jobs before now minus the retention window, in batches, and returns the total', async () => {
    const deleteProcessedBefore = jest
      .fn()
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);

    const useCase = new CleanupEmailOutboxUseCase(
      mockOf<EmailOutboxRepository>({ deleteProcessedBefore }),
    );

    await expect(
      useCase.execute({ retentionDays: 7, batchSize: 2 }),
    ).resolves.toBe(3);

    expect(deleteProcessedBefore).toHaveBeenCalledTimes(2);
    expect(deleteProcessedBefore).toHaveBeenCalledWith(
      new Date('2026-10-01T12:00:00.000Z'),
      2,
    );
  });
});
