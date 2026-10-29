import type { AccountLedgerRegistry } from '@modules/accounts';
import { mockOf } from '@test/support/mocks/mock-of';
import { TransactionState } from '../../../domain/enums/transaction-state.enum';
import type { TransactionRepository } from '../../../domain/repositories/transaction.repository';
import { TransactionAccountLedger } from '../transaction-account-ledger';

describe('TransactionAccountLedger', () => {
  function build() {
    const repository = {
      sumBalanceChanges: jest.fn().mockResolvedValue(new Map([[3, 120]])),
      existsForAccount: jest.fn().mockResolvedValue(true),
    };

    const registry = { register: jest.fn() };

    const ledger = new TransactionAccountLedger(
      mockOf<TransactionRepository>(repository),
      mockOf<AccountLedgerRegistry>(registry),
    );

    return { ledger, repository, registry };
  }

  it('registers itself into the accounts ledger registry', () => {
    const { ledger, registry } = build();

    ledger.onModuleInit();

    expect(registry.register).toHaveBeenCalledWith(ledger);
  });

  it('reports the effect of completed transactions only', async () => {
    const { ledger, repository } = build();

    await expect(ledger.balanceChanges(1, [3])).resolves.toEqual(
      new Map([[3, 120]]),
    );
    expect(repository.sumBalanceChanges).toHaveBeenCalledWith(1, [3], {
      state: TransactionState.COMPLETED,
    });
  });

  it('reports whether any transaction references the account', async () => {
    const { ledger, repository } = build();

    await expect(ledger.hasEntries(1, 3)).resolves.toBe(true);
    expect(repository.existsForAccount).toHaveBeenCalledWith(1, 3);
  });
});
