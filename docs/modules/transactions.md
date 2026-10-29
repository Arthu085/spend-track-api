# Transactions module

> Location: `src/modules/transactions/` · Rules: [financial data ownership](../conventions.md#financial-data-ownership)
> and [HTTP](../conventions.md#http) · Related: [`accounts.md`](accounts.md),
> [`transaction-categories.md`](transaction-categories.md), [`dashboard.md`](dashboard.md)

The user's income, expenses, and transfers between their own accounts in `transactions`. Routes and
payloads are in Swagger; this document covers the rules behind them.

## Public API

- `index.ts`: `TransactionEntity`, `TransactionType`, `TransactionState`, and
  `TRANSACTION_REPOSITORY`/`TransactionRepository` with its summary types, consumed by `dashboard`.
- `presentation.ts`: `TransactionAccountResponseDto` and `transactionTypeLabel`, used by the dashboard
  response.
- `transactions.module.ts`: `TransactionsModule`. It imports `AccountsModule` and
  `TransactionCategoriesModule`; neither imports it back.

## Ownership

Every route needs authentication but no ability and works only on the caller's transactions. Lookups
filter by `user_id` in the query, so another user's transaction is a `404`
(`TransactionNotFoundError`) for everyone, including admins. References are resolved through the
owner-scoped lookups of their modules (`findOwnedAccount`, `findVisibleTransactionCategory`), so a
foreign or missing account or category answers that module's `404`. List filters by `accountUuid`
or `categoryUuid` simply match nothing for a foreign or unknown uuid.

## Type and references

- `type` is `INCOME`, `EXPENSE`, or `TRANSFER` and never changes after creation.
- `account` is required: the source of an expense or transfer, the destination of an income.
- `destinationAccount` is required for a transfer, must differ from `account`
  (`TransferSameAccountError`, `422`), and is null otherwise.
- `category` is required for income and expenses and must have the same kind
  (`TransactionCategoryKindMismatchError`, `422`); transfers have none.
- A reference that does not fit the type (a category on a transfer, a destination on an expense)
  answers `InvalidTransactionReferencesError` (`422`). The create DTO already rejects the common
  cases with a `400`.
- An account or category must be `ACTIVE` when it is set, on creation or when an update changes it
  (`InactiveAccountError`, `InactiveTransactionCategoryError`, `409`). Existing transactions keep
  inactive accounts and inactive or soft-deleted categories: reads load them with `withDeleted`.
- Check constraints mirror these rules in PostgreSQL (`chk_transactions_*`): positive amount,
  destination only and always for transfers and never the source account, category except for
  transfers, `completed_on` set exactly while completed, and `canceled_at` set exactly when canceled.

## State

`state` is the lifecycle of a transaction; the shared record `status` stays `ACTIVE`, is not exposed,
and has no route, so `assertRecordActive` does not apply here.

| State       | Actual balance | Projection | Editable fields                        | Deletable |
| ----------- | -------------- | ---------- | -------------------------------------- | --------- |
| `PLANNED`   | No             | Yes        | Every field except `type` and `state`  | Yes       |
| `COMPLETED` | Yes            | No         | `description`, `categoryUuid`, `notes` | No        |
| `CANCELED`  | No             | No         | None                                   | No        |

- Transitions go through `PUT /transactions/:uuid/state`: `PLANNED → COMPLETED`,
  `PLANNED → CANCELED`, and `COMPLETED → CANCELED`. Anything else, including completing twice, is
  `TransactionStateTransitionError` (`409`). There is no way back to `PLANNED`: correct a completed
  transaction by canceling it and recording a new one.
- A transaction may be created directly as `COMPLETED`; `completedOn` then defaults to `date`.
  Completing later defaults `completedOn` to today in `America/Sao_Paulo`. Completing requires the
  accounts to be active.
- Canceling keeps the record visible as history with `canceledAt`, and keeps the `completedOn` of a
  completed transaction; its balance effect disappears because only completed transactions count.
- Changing a financial field (`amount`, `date`, either account) of a completed transaction, or any
  field of a canceled one, answers `TransactionNotEditableError` (`409`). Values equal to the current
  ones are accepted, so a client may resend them.
- Only planned transactions can be soft-deleted; otherwise `TransactionNotDeletableError` (`409`).

## Concurrency

Every write runs in one database transaction. Create, update, and state changes first take the
per-user account lock (`AccountRepository.lockOwnerAccounts`), so they serialize with account
updates, deactivation, and deletion; then updates, state changes, and deletes lock the transaction
row (`FOR NO KEY UPDATE`, join-free) and re-read it before checking its state. A transaction is
therefore completed exactly once, and an account is never deleted while a transaction referencing it
is being written.

## Balances

`TransactionAccountLedger` registers into the accounts ledger registry (`ACCOUNT_LEDGERS`, see
[`accounts.md`](accounts.md#balances)) in `onModuleInit`. It sums completed, non-deleted
transactions per account in SQL (`numeric` sums parsed with `parseMoneyTotal`): `+amount` for income into
the account, `-amount` for expenses and transfers out of it, and `+amount` for transfers into it. A
transfer therefore never changes the total across the user's accounts and never counts as income or
spending. The same query with `PLANNED` and an end date gives the dashboard projection.

## Configuration

None.
