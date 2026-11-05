# Investments module

> Location: `src/modules/investments/` · Rules: [financial data ownership](../conventions.md#financial-data-ownership)
> and [HTTP](../conventions.md#http) · Related: [`accounts.md`](accounts.md), [`dashboard.md`](dashboard.md)

The user's investments, reserves, and savings goals in `investments`, and their contributions,
withdrawals, and manual valuations in `investment_movements`. There is no brokerage integration and
no returns analytics: the value of an investment is what its movements say. Routes and payloads are
in Swagger; this document covers the rules behind them.

## Public API

- `index.ts`: `InvestmentEntity`, `InvestmentMovementEntity`, `InvestmentType`,
  `InvestmentMovementType`, `ContributionKind`, `INVESTMENT_REPOSITORY`/`InvestmentRepository`,
  `INVESTMENT_MOVEMENT_REPOSITORY`/`InvestmentMovementRepository` with `InvestmentMovementTotal` and
  `ContributionKindTotal`, `InvestmentValues` with `InvestmentWithValue` and `InvestmentValue`,
  `targetProgress`, `findActiveInvestment`, `InactiveInvestmentError`, and
  `AdditionalContributionAlreadyExistsError`, consumed by `dashboard` and `recurrences`.
  `InvestmentLifecycle` accepts participants from dependent modules for archival and deletion guards;
  `InvestmentHasRecurrencesError` identifies a blocked deletion.
- `presentation.ts`: `investmentTypeLabel`, `InvestmentProgressResponseDto`,
  `InvestmentMovementResponseDto`, and `NON_NEGATIVE_MONEY_PATTERN`, used by the dashboard and
  recurrence responses and inputs.
- `persistence.ts`: `InvestmentMapper`, used by the recurrence mapper.
- `investments.module.ts`: `InvestmentsModule`. It imports `AccountsModule`, which does not import
  it back. `RecurrencesModule` imports it, never the reverse; only the movement ORM entity references
  the recurrence ORM entity, as transactions do. Movement states reuse `TransactionState` from
  `transactions`.

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
  keeps its movements and value and rejects `GET /investments/:uuid`, `PATCH`, new movements, and
  valuations (`InactiveInvestmentError`, `409`), but its movements stay listable, confirmable, and
  cancelable. `GET /investments` defaults to `ACTIVE` and orders by name.
- `DELETE` first rejects an investment referenced by any active or paused contribution recurrence
  (`InvestmentHasRecurrencesError`, `409`), even without movements; end the recurrence first. It then
  soft-deletes only while there are no movements, in any state; otherwise `InvestmentHasHistoryError`
  (`409`) asks the user to archive it instead. Ended recurrences and all historical records stay intact.

## Archiving with planned movements

An investment's pending operations are its `PLANNED` movements. Completed and canceled movements are
recorded history, and archiving never changes them.

- `GET /investments/:uuid/pending-operations` returns their `count` and `total` (the sum of their
  amounts, contributions and withdrawals alike), for an active or an archived investment.
- Moving an investment from `ACTIVE` to `INACTIVE` requires `pendingOperations` when it has any;
  otherwise `InvestmentPendingOperationsDecisionRequiredError` (`409`) and nothing changes. The body
  is not read in any other transition, so re-archiving and reactivating ignore it.
- `KEEP` leaves them planned. They keep moving the dashboard projection and can still be confirmed,
  which changes the account balance and the value as usual and still needs an active account, or
  canceled.
- `CANCEL` moves them to `CANCELED` with `canceledAt` in the same transaction, so they stay listed as
  history and stop counting. It also ends every non-ended contribution recurrence of the investment;
  these cannot resume and canceled dates never regenerate.
- `KEEP`, or archiving with no planned movements, pauses active contribution recurrences without
  removing their planned rows. Reactivating the investment leaves them paused; explicitly resume
  after the account and investment are active. Existing paused recurrences stay paused on `KEEP`,
  while `CANCEL` ends them. Completed, canceled, and ended history never changes. See
  [`recurrences.md`](recurrences.md#investment-contributions) for cursor and resume rules.

## Contribution kinds

Every movement has a `contributionKind`:

- `ONE_TIME` is the default: manual contributions and every withdrawal and valuation.
- `MANDATORY` is an occurrence of a recurring contribution, with `recurrence_id` and
  `recurrence_date`. A partial unique index on them covers live rows, canceled ones included, so a
  canceled date is never generated again.
- `ADDITIONAL` is a surplus contribution the user accepted, with `recurrence_id`, `surplus_month` (the
  first day of its month), and an immutable snapshot of `suggested_amount` and `retained_minimum`. A
  partial unique index on `(recurrence_id, surplus_month)` covers live, non-canceled rows, so canceling
  it frees the month.

Check constraints keep these fields consistent with the kind, and a kind other than `ONE_TIME` is
always a `CONTRIBUTION`. The response exposes `contributionKind`, `contributionKindLabel`,
`recurrence` (`uuid` and `occurrenceDate`), `surplusMonth`, `suggestedAmount`, and `retainedMinimum`.
They follow the same movement rules below, and recurring ones are created, edited, and removed by
[`recurrences.md`](recurrences.md#investment-contributions). `MANDATORY` rows the recurrence removes
are soft-deleted and stop counting everywhere.

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
  `InvestmentMovementStateTransitionError` (`409`). These routes have no edit or delete: correct a
  movement by canceling it and recording a new one. Only a planned `MANDATORY` movement can be edited
  or removed, through its recurrence.
- A movement created as `COMPLETED` defaults `completedOn` to its `date`; confirming later defaults
  it to today in `America/Sao_Paulo` and needs an active account.
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
take the investment lock, which is also enough for archiving to cancel planned movements, since
those change no balance or value.

## Configuration

None.
