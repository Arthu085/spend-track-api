# Dashboard module

> Location: `src/modules/dashboard/` · Rules: [financial data ownership](../conventions.md#financial-data-ownership)
> · Related: [`accounts.md`](accounts.md), [`preferences.md`](preferences.md)

`GET /dashboard` returns the caller's monthly financial summary. It owns no table: it reads the
caller's accounts and preferences through their modules' repository ports. Routes and payloads are
in Swagger; this document covers the rules behind them.

## Period

- `year` and `month` are sent together; one without the other is a `400`. Without both, the
  dashboard opens the user's preferred default month (current or next).
- "Today" is the calendar date in `America/Sao_Paulo` (`FINANCE_TIME_ZONE`).
- `timing` is `PAST`, `CURRENT`, or `FUTURE`. `remainingDays` counts today in the current month, is
  every day of a future month, and is `0` for a past month, so daily guidance never divides by zero.
- `perspective` overrides the stored spending perspective for one request without saving it.

## Figures

- Every figure comes from the caller's own records; nothing is cached or stored.
- `balances.actual` sums the actual balances of the caller's **active** accounts; inactive accounts
  are excluded. `balances.projected` is the expected balance at the end of the period, which equals
  the actual balance until planned operations exist.
- Sums use integer cents (`sumMoney`) and are returned as decimal strings, so totals always equal the
  sum of the listed accounts.

## Configuration

None.
