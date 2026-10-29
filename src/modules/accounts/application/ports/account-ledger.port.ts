export const ACCOUNT_LEDGERS = Symbol('ACCOUNT_LEDGERS');

export interface AccountLedger {
  balanceChanges(
    ownerId: number,
    accountIds: readonly number[],
  ): Promise<Map<number, number>>;
  hasEntries(ownerId: number, accountId: number): Promise<boolean>;
}

export interface AccountLedgerRegistry extends AccountLedger {
  register(ledger: AccountLedger): void;
}
