# Budgets module

> Location: `src/modules/budgets/` · Rules: [financial data ownership](../conventions.md#financial-data-ownership)
> · Related: [`transaction-categories.md`](transaction-categories.md), [`dashboard.md`](dashboard.md)

Per-user monthly budgets in `budgets`, one row per user and month, with optional per-category limits
in `budget_category_limits`. A budget only stores limits; spending against them is computed by the
dashboard ([`dashboard.md`](dashboard.md#figures)). Routes and payloads are in Swagger; this
document covers the rules behind them.

## Public API

- `index.ts`: `BUDGET_REPOSITORY`/`BudgetRepository` with `StoredBudget` and `BudgetCategoryLimit`,
  consumed by `dashboard`.
- `budgets.module.ts`: `BudgetsModule`. It imports `TransactionCategoriesModule`.

## Ownership

Every route needs authentication but no ability and works only on the caller's budget of the month
in the path (`/budgets/:year/:month`). Lookups filter by `user_id`, so an admin reading a month sees
their own budget, never another user's. Categories resolve through the owner-scoped lookup of
`transaction-categories`, so another user's personal category is a `404`
(`TransactionCategoryNotFoundError`).

## Limits

- A budget has an overall limit, category limits, or both; a budget with neither is
  `EmptyBudgetError` (`422`). Every limit is strictly positive.
- Category limits use expense categories only (`BudgetCategoryNotExpenseError`, `422`), at most one
  limit per category and 100 per month. A category added to the month must be active
  (`InactiveTransactionCategoryError`, `409`); one already in the month's budget may stay after it is
  deactivated or deleted, so editing an older month never fails because of it.
- Category limits are independent of the overall limit: their sum is not checked against it, and
  they are never reserved on top of it by the daily allowance.
- Budgets never block transactions. Exceeding a limit only changes the dashboard indicators.

## Months

- Each month is independent: saving or deleting one never changes another, and a month without a
  budget has none (there is no carry-over). The client copies the previous month to prefill a new
  one.
- `GET` returns a null `totalLimit`, no category limits, and a null `updatedAt` for a month without a
  budget. `PUT` creates or fully replaces the month's limits. `DELETE` removes them, or answers
  `BudgetNotFoundError` (`404`) when the month has none.

## Persistence

Budgets are plans, not financial history, so both tables extend `BaseTechnicalOrmEntity` like
`user_preferences`: no status or soft delete. `PUT` upserts the `(user_id, month)` row, which locks
it, then replaces its category limits in the same transaction, so concurrent saves of one month apply
one after the other. Deleting a budget cascades to its category limits; transactions never change.

## Configuration

None.
