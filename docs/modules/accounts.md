# Accounts module

> Location: `src/modules/accounts/` · Rules: [financial data ownership](../conventions.md#financial-data-ownership)
> and [HTTP](../conventions.md#http) · Related: [`dashboard.md`](dashboard.md)

The user's financial accounts (bank accounts, savings, cash/wallet) in `accounts`. Routes and
payloads are in Swagger; this document covers the rules behind them.

## Public API

- `index.ts`: `AccountEntity`, `AccountType`, and `ACCOUNT_REPOSITORY`/`AccountRepository`,
  consumed by `dashboard`.
- `presentation.ts`: `accountTypeLabel`, used by the dashboard response.
- `accounts.module.ts`: `AccountsModule`.

## Ownership

Every route needs authentication but no ability and works only on the caller's accounts. Lookups
filter by `user_id` in the query, so another user's account is a `404` (`AccountNotFoundError`) for
everyone, including admins.

## Balances

- `openingBalance` is the balance on `openingBalanceDate`, before any recorded operation. It may be
  negative (an overdraft).
- `currentBalance` is the actual balance. Until transactions exist it equals the opening balance;
  completed operations will change it and planned ones never will.
- Amounts follow the shared money rules: integer cents in the domain, `numeric(14,2)` columns, and
  decimal strings over HTTP.

## Default account

- At most one live account per user is the default, enforced by the partial unique index
  `uq_accounts_default_per_user` (`user_id` where `is_default` and not deleted).
- Every account write for a user runs in one transaction under a per-user advisory lock
  (`lockOwnerAccounts`): update, status change, and delete take it before reading the account, and
  creating a default account takes it before clearing the previous default. Concurrent requests
  therefore never keep two defaults or save a stale copy of an account another request just changed. `isDefault: false` simply leaves the user without
  one.
- Archiving or deleting an account clears its flag; restoring it does not make it the default again.

## Archiving and deletion

`status` follows the shared convention: `PUT /accounts/:uuid/status` archives (`INACTIVE`) or
restores an account, and `DELETE` soft-deletes it. Archived accounts stay listable with
`?status=INACTIVE` and keep their history; `GET /accounts/:uuid` and `PATCH` reject them with
`InactiveAccountError` (`409`). The list defaults to `ACTIVE`, puts the default account first, and
is not paginated, since a user has few accounts.

## Configuration

None.
