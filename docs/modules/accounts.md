# Accounts module

> Location: `src/modules/accounts/` · Rules: [financial data ownership](../conventions.md#financial-data-ownership)
> and [HTTP](../conventions.md#http) · Related: [`transactions.md`](transactions.md),
> [`dashboard.md`](dashboard.md)

The user's financial accounts (bank accounts, savings, cash/wallet) in `accounts`. Routes and
payloads are in Swagger; this document covers the rules behind them.

## Public API

- `index.ts`: `AccountEntity`, `AccountType`, `ACCOUNT_REPOSITORY`/`AccountRepository`,
  `findOwnedAccount`, `AccountNotFoundError`, `InactiveAccountError`, `assertNotBeforeOpening`,
  `AccountOperationBeforeOpeningError`, the ledger port
  (`ACCOUNT_LEDGERS`, `AccountLedger`, `AccountLedgerRegistry`), and `withCurrentBalances`, consumed
  by `transactions`, `credit-cards`, `investments`, and `dashboard`.
- `presentation.ts`: `accountTypeLabel`, used by the dashboard response.
- `persistence.ts`: `AccountMapper`, used by the transactions mapper.
- `accounts.module.ts`: `AccountsModule`.

## Ownership

Every route needs authentication but no ability and works only on the caller's accounts. Lookups
filter by `user_id` in the query, so another user's account is a `404` (`AccountNotFoundError`) for
everyone, including admins.

## Balances

- `openingBalance` is the balance on `openingBalanceDate`, before any recorded operation. It may be
  negative (an overdraft).
- `currentBalance` is the actual balance: `openingBalance` plus the effect of every completed,
  non-deleted operation on the account, whatever its date. Planned and canceled operations never
  change it. Every route that returns an account returns it.
- `accounts` cannot import `transactions`, which depends on it, so it owns a ledger port with a
  registry (`ACCOUNT_LEDGERS`, the same mechanism as the
  [revoker registries](users.md#sessions-and-tokens)). `transactions` registers its ledger in
  `onModuleInit`; `balanceChanges(ownerId, accountIds)` adds up every registered ledger per account,
  `hasEntries(ownerId, accountId)` tells whether any ledger references the account, and
  `earliestEntryDate(ownerId, accountId)` answers the earliest date of its planned or completed
  operations, and `latestHistoricalEntryDate(ownerId, accountId)` the latest record kept from before
  the opening date. With nothing registered, changes are 0 and there are no entries. A module that adds operations on accounts
  registers its own ledger; nothing checks that at compile time, so cover it with a test.
  `credit-cards` registers one for invoice payments and `investments` one for contributions and
  withdrawals.
- Amounts follow the shared money rules: integer cents in the domain, `numeric(14,2)` columns, and
  decimal strings over HTTP.

## Opening balance

`openingBalance` already includes everything that happened before `openingBalanceDate`, so an
operation dated before it would count twice.

- An operation cannot be dated before the opening date of any account it touches
  (`assertNotBeforeOpening`, `AccountOperationBeforeOpeningError`, `422`): a transaction's `date` and
  `completedOn` on both accounts of a transfer, an invoice payment's `paidOn`, an investment
  movement's `date` and `completedOn`, and an account recurrence's `startDate`, occurrence edits, and
  confirmations. An operation on the opening date itself is allowed. A date left out defaults to
  today, so an account opening in the future rejects it too.
- `openingBalanceDate` can move earlier, down to the limit below. It can move later only up to the earliest planned
  or completed, non-deleted operation (`earliestEntryDate`); past that it answers
  `AccountOpeningAfterOperationsError` (`422`). Canceled and deleted operations do not hold it back.
- Historical invoice settlements ([`credit-cards.md`](credit-cards.md#historical-settlements)) are the
  one record dated before the opening date, because the opening balance includes them. They never
  change the balance, and the opening date cannot move to or before the latest live one
  (`latestHistoricalEntryDate`, `AccountOpeningNotAfterHistoricalEntriesError`, `422`).
- `openingBalance` can change at any time, with or without history. Current and projected balances
  shift by exactly the difference and no operation is rewritten.
- There is no data migration: an operation recorded before these rules, dated before its account's
  opening date, keeps counting so no balance silently changes. Edits that leave its date and accounts
  alone are accepted; changing them, or completing a planned one, applies the rule above.

## Default account

- At most one live account per user is the default, enforced by the partial unique index
  `uq_accounts_default_per_user` (`user_id` where `is_default` and not deleted).
- Every account write for a user runs in one transaction under a per-user advisory lock
  (`lockOwnerAccounts`): update, status change, and delete take it before reading the account, and
  creating a default account takes it before clearing the previous default. Concurrent requests
  therefore never keep two defaults or save a stale copy of an account another request just changed.
  `isDefault: false` simply leaves the user without one.
- Deactivating or deleting an account clears its flag; reactivating it does not make it the default
  again.

## Deactivation and deletion

`status` follows the shared convention: `PUT /accounts/:uuid/status` deactivates (`INACTIVE`) or
reactivates an account, and `DELETE` soft-deletes it. An account referenced by any non-deleted
transaction, in any state and as source or destination, by any credit card invoice payment, or by
any investment movement, has history: `DELETE` answers
`AccountHasHistoryError` (`409`), and the user deactivates it instead. The check runs under the
per-user lock, which transaction writes also take. Inactive accounts stay listable with
`?status=INACTIVE` and keep their history; `GET /accounts/:uuid` and `PATCH` reject them with
`InactiveAccountError` (`409`). `GET /accounts` is paginated like every list (`page`, `limit`),
defaults to `ACTIVE`, and puts the default account first, then orders by name. The dashboard reads
every active account through `findAllByOwner`, which is not paginated.

## Configuration

None.
