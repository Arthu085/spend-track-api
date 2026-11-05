import type { AccountLedger } from '../../ports/account-ledger.port';
import { AccountLedgers } from '../account-ledgers';

describe('AccountLedgers', () => {
  it('reports no change and no entries when no ledger is registered', async () => {
    const registry = new AccountLedgers();

    await expect(registry.balanceChanges(1, [10])).resolves.toEqual(new Map());
    await expect(registry.hasEntries(1, 10)).resolves.toBe(false);
    await expect(registry.earliestEntryDate(1, 10)).resolves.toBeNull();
    await expect(registry.latestHistoricalEntryDate(1, 10)).resolves.toBeNull();
  });

  it('adds up the changes of every registered ledger per account', async () => {
    const registry = new AccountLedgers();

    const ledger = (changes: Array<[number, number]>): AccountLedger => ({
      balanceChanges: jest.fn().mockResolvedValue(new Map(changes)),
      hasEntries: jest.fn().mockResolvedValue(false),
      earliestEntryDate: jest.fn().mockResolvedValue(null),
      latestHistoricalEntryDate: jest.fn().mockResolvedValue(null),
    });

    registry.register(
      ledger([
        [10, 500],
        [11, -20],
      ]),
    );
    registry.register(ledger([[10, -125]]));

    await expect(registry.balanceChanges(1, [10, 11])).resolves.toEqual(
      new Map([
        [10, 375],
        [11, -20],
      ]),
    );
  });

  it('stops at the first ledger that has entries for the account', async () => {
    const registry = new AccountLedgers();
    const later = jest.fn();

    registry.register({
      balanceChanges: jest.fn(),
      hasEntries: jest.fn().mockResolvedValue(true),
      earliestEntryDate: jest.fn(),
      latestHistoricalEntryDate: jest.fn(),
    });
    registry.register({
      balanceChanges: jest.fn(),
      hasEntries: later,
      earliestEntryDate: jest.fn(),
      latestHistoricalEntryDate: jest.fn(),
    });

    await expect(registry.hasEntries(1, 10)).resolves.toBe(true);
    expect(later).not.toHaveBeenCalled();
  });

  it('answers the earliest entry date across every ledger', async () => {
    const registry = new AccountLedgers();

    for (const date of ['2026-05-10', null, '2026-03-01']) {
      registry.register({
        balanceChanges: jest.fn(),
        hasEntries: jest.fn(),
        earliestEntryDate: jest.fn().mockResolvedValue(date),
        latestHistoricalEntryDate: jest.fn(),
      });
    }

    await expect(registry.earliestEntryDate(1, 10)).resolves.toBe('2026-03-01');
  });

  it('answers the latest historical entry date across every ledger', async () => {
    const registry = new AccountLedgers();

    for (const date of ['2026-03-01', null, '2026-05-10']) {
      registry.register({
        balanceChanges: jest.fn(),
        hasEntries: jest.fn(),
        earliestEntryDate: jest.fn(),
        latestHistoricalEntryDate: jest.fn().mockResolvedValue(date),
      });
    }

    await expect(registry.latestHistoricalEntryDate(1, 10)).resolves.toBe(
      '2026-05-10',
    );
  });
});
