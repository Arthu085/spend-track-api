# Dashboard module

> Location: `src/modules/dashboard/` · Rules: [financial data ownership](../conventions.md#financial-data-ownership)
> · Related: [`accounts.md`](accounts.md), [`preferences.md`](preferences.md),
> [`transactions.md`](transactions.md)

`GET /dashboard` returns the caller's monthly financial summary. It owns no table: it reads the
caller's accounts, preferences, and transactions through their modules' ports. Routes and payloads are
in Swagger; this document covers the rules behind them.

## Period

- `year` and `month` are sent together; one without the other is a `400`. Without both, the
  dashboard opens the user's preferred default month (current or next).
- "Today" is the calendar date in `America/Sao_Paulo` (`financeToday`, `src/shared/domain/calendar/`).
- `timing` is `PAST`, `CURRENT`, or `FUTURE`. `remainingDays` counts today in the current month, is
  every day of a future month, and is `0` for a past month, so daily guidance never divides by zero.
- `perspective` overrides the stored spending perspective for one request without saving it.

## Figures

- Every figure comes from the caller's own records; nothing is cached or stored.
- `accounts[].actualBalance` is the account's `currentBalance` (every completed transaction, any
  date). `accounts[].projectedBalance` adds the effect of every planned transaction touching the
  account dated up to the end of the period, overdue ones from earlier months included, since they
  are still expected. A transfer between an active and an inactive account applies each side to its
  own account, so only the active side shows.
- `balances.actual` and `balances.projected` sum the **active** accounts; inactive accounts are
  excluded.
- `income` and `expenses` cover transactions of that type dated inside the period: `completed` is
  `COMPLETED`, `pending` is `PLANNED`, and `total` is both. Canceled transactions and transfers never
  count; accounts of any status do.
- `expensesByCategory` groups the same expenses by category, largest total first, then by stored
  name; inactive and soft-deleted categories still appear. The totals add up to `expenses.total`.
- `upcoming` lists at most 10 planned transactions of any type dated up to the end of the period,
  oldest first; `upcomingCount` is how many match, and `overdue` marks dates before today. These are
  exactly the items behind the difference between projected and actual balances.
- Until credit cards exist both perspectives give the same numbers: account transactions are
  grouped by `date` in both.
- Sums use integer cents (`sumMoney`) and are returned as decimal strings, so totals always equal the
  sum of the listed accounts.

## Configuration

None.
