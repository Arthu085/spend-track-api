# Investments module

> Location: `src/modules/investments/` · Rules: [financial data ownership](../conventions.md#financial-data-ownership)
> and [HTTP](../conventions.md#http) · Related: [`accounts.md`](accounts.md), [`dashboard.md`](dashboard.md)

The user's investments, reserves, and savings goals in `investments`, and their contributions,
withdrawals, and manual valuations in `investment_movements`. There is no brokerage integration and
no returns analytics: the value of an investment is what its movements say. Routes and payloads are
in Swagger; this document covers the rules behind them.

## Public API

- `index.ts`: `InvestmentEntity`, `InvestmentType`, `InvestmentMovementType`,
  `INVESTMENT_REPOSITORY`/`InvestmentRepository`,
  `INVESTMENT_MOVEMENT_REPOSITORY`/`InvestmentMovementRepository` with `InvestmentMovementTotal`,
  `InvestmentValues` with `InvestmentWithValue` and `InvestmentValue`, and `targetProgress`,
  consumed by `dashboard`.
- `presentation.ts`: `investmentTypeLabel` and `InvestmentProgressResponseDto`, used by the
  dashboard response.
- `investments.module.ts`: `InvestmentsModule`. It imports `AccountsModule`, which does not import
  it back. Movement states reuse `TransactionState` from `transactions`.

## Ownership

Every route needs authentication but no ability and works only on the caller's records. Investments
and movements carry `user_id`; investments are looked up by owner and movements inside their owned
investment, so a foreign record is a `404` (`InvestmentNotFoundError`,
`InvestmentMovementNotFoundError`) for everyone, including admins. Accounts resolve through
`findOwnedAccount`, so another user's account is the accounts `404`.

## Investments

- An investment has a `name`, a `type` (`INVESTMENT`, `RESERVE`, or `GOAL`, which only changes how
  it is grouped and shown), an optional strictly positive `targetAmount`, and a `status`.
- It starts with a value of 0. Money already invested elsewhere is recorded with a valuation, money
  moved from an account with a contribution.
- `currentValue` is `contributed − withdrawn + adjusted`, summed over its completed movements of any
  date. Planned and canceled movements never count.
- With a target, `progress.remaining` is `targetAmount − currentValue` (never below 0) and
  `progress.percent` is the whole percentage reached, rounded down, above 100 once exceeded.
- `PUT /investments/:uuid/status` archives (`INACTIVE`) or reactivates it. An archived investment
  keeps its movements and value, rejects `GET /investments/:uuid`, `PATCH`, new movements,
  valuations, and confirmations (`InactiveInvestmentError`, `409`), but its movements stay listable
  and cancelable. `GET /investments` defaults to `ACTIVE` and orders by name.
- `DELETE` soft-deletes an investment only while it has no movement, in any state; otherwise
  `InvestmentHasHistoryError` (`409`) and the user archives it instead.

## Movements

| Type           | Account | Amount                    | Value  | Account balance |
| -------------- | ------- | ------------------------- | ------ | --------------- |
| `CONTRIBUTION` | Source  | Strictly positive         | +      | −               |
| `WITHDRAWAL`   | Target  | Strictly positive         | −      | +               |
| `VALUATION`    | None    | Signed change, never zero | ± sign | Unchanged       |

- Contributions and withdrawals move money between one of the caller's active accounts and the
  investment. They are never income or expenses: the money stays the user's.
- `state` follows the transaction lifecycle: `PLANNED` affects projections only, `COMPLETED` changes
  the account balance and the value, `CANCELED` affects nothing and stays listed as history with
  `canceledAt`. Transitions go through `PUT /investments/:uuid/movements/:movementUuid/state`:
  `PLANNED → COMPLETED`, `PLANNED → CANCELED`, `COMPLETED → CANCELED`; anything else is
  `InvestmentMovementStateTransitionError` (`409`). There is no edit or delete: correct a movement
  by canceling it and recording a new one.
- A movement created as `COMPLETED` defaults `completedOn` to its `date`; confirming later defaults
  it to today in `America/Sao_Paulo` and needs an active investment and account.
- `date` and `completedOn` cannot be before the account's opening date
  ([`accounts.md`](accounts.md#opening-balance)).
- `POST /investments/:uuid/valuations` takes the new `value` (non-negative) and records the
  difference from `currentValue` as a completed `VALUATION`, dated today unless `date` is sent. A
  value equal to the current one is `InvestmentValuationUnchangedError` (`422`). Valuations never
  touch an account.
- The value never goes below 0: completing a withdrawal, or canceling a completed contribution or a
  positive valuation, that would leave it negative is `InvestmentInsufficientValueError` (`422`).
- Check constraints mirror these rules in PostgreSQL (`chk_investment_movements_*`): the amount sign
  per type, an account exactly for non-valuations, no planned valuation, `completed_on` set while
  completed, and `canceled_at` set exactly when canceled.

## Balances

`InvestmentMovementLedger` registers into the accounts ledger registry (`ACCOUNT_LEDGERS`, see
[`accounts.md`](accounts.md#balances)): it subtracts completed contributions from their account and
adds completed withdrawals. Any movement referencing an account, canceled or not, counts as account
history. The same query with `PLANNED` and an end date gives the dashboard projection.

## Concurrency

Every movement write runs in one database transaction under the per-user account lock
(`AccountRepository.lockOwnerAccounts`) and then the per-user investment lock
(`InvestmentRepository.lockOwnerInvestments`, a transaction-scoped advisory lock), the same order as
every account write. Value checks therefore read a value no concurrent request is changing, and a
movement is completed or canceled exactly once. Investment updates, status changes, and deletion
take the investment lock.

## Configuration

None.
