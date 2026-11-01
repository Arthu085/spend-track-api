# Accounts module

> Location: `src/modules/accounts/` · Rules: [financial data ownership](../conventions.md#financial-data-ownership)
> and [HTTP](../conventions.md#http) · Related: [`transactions.md`](transactions.md),
> [`dashboard.md`](dashboard.md)

The user's financial accounts (bank accounts, savings, cash/wallet) in `accounts`. Routes and
payloads are in Swagger; this document covers the rules behind them.

## Public API

- `index.ts`: `AccountEntity`, `AccountType`, `ACCOUNT_REPOSITORY`/`AccountRepository`,
  `findOwnedAccount`, `AccountNotFoundError`, `InactiveAccountError`, the ledger port
  (`ACCOUNT_LEDGERS`, `AccountLedger`, `AccountLedgerRegistry`), and `withCurrentBalances`, consumed
  by `transactions` and `dashboard`.
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
  `onModuleInit`; `balanceChanges(ownerId, accountIds)` adds up every registered ledger per account
  and `hasEntries(ownerId, accountId)` tells whether any ledger references the account. With nothing
  registered, changes are 0 and there are no entries. A module that adds operations on accounts
  registers its own ledger; nothing checks that at compile time, so cover it with a test.
- Amounts follow the shared money rules: integer cents in the domain, `numeric(14,2)` columns, and
  decimal strings over HTTP.

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
transaction, in any state and as source or destination, has history: `DELETE` answers
`AccountHasHistoryError` (`409`), and the user deactivates it instead. The check runs under the
per-user lock, which transaction writes also take. Inactive accounts stay listable with
`?status=INACTIVE` and keep their history; `GET /accounts/:uuid` and `PATCH` reject them with
`InactiveAccountError` (`409`). `GET /accounts` is paginated like every list (`page`, `limit`),
defaults to `ACTIVE`, and puts the default account first, then orders by name. The dashboard reads
every active account through `findAllByOwner`, which is not paginated.

## Configuration

None.
