import type { AccountLedger } from '../../ports/account-ledger.port';
import { AccountLedgers } from '../account-ledgers';

describe('AccountLedgers', () => {
  it('reports no change and no entries when no ledger is registered', async () => {
    const registry = new AccountLedgers();

    await expect(registry.balanceChanges(1, [10])).resolves.toEqual(new Map());
    await expect(registry.hasEntries(1, 10)).resolves.toBe(false);
  });

  it('adds up the changes of every registered ledger per account', async () => {
    const registry = new AccountLedgers();

    const ledger = (changes: Array<[number, number]>): AccountLedger => ({
      balanceChanges: jest.fn().mockResolvedValue(new Map(changes)),
      hasEntries: jest.fn().mockResolvedValue(false),
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
    });
    registry.register({ balanceChanges: jest.fn(), hasEntries: later });

    await expect(registry.hasEntries(1, 10)).resolves.toBe(true);
    expect(later).not.toHaveBeenCalled();
  });
});
