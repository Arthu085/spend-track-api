import { AccountEntity } from '../../domain/entities/account.entity';
import type { AccountLedger } from '../ports/account-ledger.port';

export async function withCurrentBalances(
  ledger: AccountLedger,
  ownerId: number,
  accounts: readonly AccountEntity[],
): Promise<AccountEntity[]> {
  if (accounts.length === 0) {
    return [];
  }

  const changes = await ledger.balanceChanges(
    ownerId,
    accounts.map((account) => account.id),
  );

  return accounts.map((account) =>
    account.withLedgerBalance(changes.get(account.id) ?? 0),
  );
}

export async function withCurrentBalance(
  ledger: AccountLedger,
  account: AccountEntity,
): Promise<AccountEntity> {
  const [withBalance] = await withCurrentBalances(ledger, account.ownerId, [
    account,
  ]);

  return withBalance;
}
