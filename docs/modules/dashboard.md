# Dashboard module

> Location: `src/modules/dashboard/` · Rules: [financial data ownership](../conventions.md#financial-data-ownership)
> · Related: [`accounts.md`](accounts.md), [`preferences.md`](preferences.md),
> [`transactions.md`](transactions.md), [`credit-cards.md`](credit-cards.md), [`budgets.md`](budgets.md),
> [`investments.md`](investments.md)

`GET /dashboard` returns the caller's monthly financial summary. It owns no table: it reads the
caller's accounts, preferences, transactions, credit cards, planned recurring card charges, budgets, and investments through their modules' ports. Routes and payloads are
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
  account dated up to the end of the period, and of every planned investment contribution or
  withdrawal on it, overdue ones from earlier months included, since they are still expected. A transfer between an active and an inactive account applies each side to its
  own account, so only the active side shows.
- `balances.actual` and `balances.projected` sum the **active** accounts; inactive accounts are
  excluded. `balances.available` is `projected` minus `creditCards.outstanding` and minus
  `creditCards.plannedDue`. Both follow the invoice's reference month, so no balance depends on the
  perspective.
- `income` and `expenses` cover transactions of that type dated inside the period: `completed` is
  `COMPLETED`, `pending` is `PLANNED`, and `total` is both. Canceled transactions and transfers never
  count; accounts of any status do.
- Card spending is added to `expenses.completed` (and `total`) and to `expensesByCategory` under the
  purchase's category: installments minus refunds, grouped according to the perspective (see below).
  Invoice payments are never expenses. Planned recurring card charges of the period (not yet
  confirmed, so on no invoice) are added to `expenses.pending` (and `total`) and to
  `expensesByCategory`, grouped by their date or invoice month according to the perspective.
- `expensesByCategory` groups the same expenses by category, largest total first, then by stored
  name; inactive and soft-deleted categories still appear. The totals add up to `expenses.total`.
- `upcoming` lists at most 10 of the caller's pending planned transactions of any type dated up to
  the end of the period, overdue ones included, oldest first, whatever the status of their accounts;
  `upcomingCount` is how many match, and `overdue` marks dates before today. The list is not a
  breakdown of projected minus actual: it also holds transfers between active accounts, which leave
  the total unchanged, and items on inactive accounts, which the totals exclude.
- The perspective only changes how card spending is grouped. `PURCHASE_DATE` counts each installment
  and refund in the month of its `date`; `INVOICE_MONTH` counts it in the reference month of its
  invoice. A purchase on October 29 on the November invoice is October spending in the first and
  November spending in the second. Account transactions are grouped by `date` in both.
- `creditCards.spending` is the card part of `expenses.completed` for the period and
  `creditCards.planned` is its part of `expenses.pending`: the planned recurring card charges of the
  period ([`recurrences.md`](recurrences.md#occurrences)), by the perspective's month.
  `creditCards.invoices` lists the invoices whose reference month is the period plus earlier ones
  still outstanding, by due date, then card name, and `creditCards.outstanding` sums what is still
  owed on them; later invoices wait for their own month.
- A card with a purchase or payment cannot be deleted ([`credit-cards.md`](credit-cards.md#cards)),
  but a card deleted before payments blocked deletion can still hold a live payment, which keeps
  lowering its account's balance. Apart from that, a deleted card's invoices and planned charges are
  left out of every figure, even though its recurrences stay readable.
- `creditCards.plannedDue` sums the planned recurring card charges expected on those same invoice
  months, including ones an earlier month left unconfirmed. `creditCards.plannedCharges` lists the
  first 10 of them, oldest first, with `overdue` marking dates before today, and
  `creditCards.plannedChargesCount` says how many there are.
- `budget` is `null` when the month has no budget ([`budgets.md`](budgets.md)). Otherwise `overall`
  (`null` without an overall limit) measures `expenses` against the overall limit and each entry of
  `categories` measures that category's `expensesByCategory` row (zeros when it has none) against its
  limit, in the order the limits were saved. Each carries `total`, `completed`, and `pending`, so
  planned and completed spending stay apart, plus `remaining` (`limit − total`, never below 0) and
  `overspent` (`total − limit`, never below 0). Planned expenses and planned recurring card charges
  are already in `total`, so an expected commitment is counted exactly once. Card spending follows
  the perspective, so switching it moves card spending between months exactly as in `expenses`.
- Budgets never block anything: exceeding a limit only changes `remaining` and `overspent`.
- `spendingGuidance` is informational. `remaining` is the lower of what the overall limit leaves
  (limit minus `expenses.total`) and `balances.available`, and `basis` says which one it is: `BUDGET`
  or `BALANCE`. Without an overall limit it is always `BALANCE`. Taking the lower figure, never
  subtracting one from the other, counts each commitment once while keeping money set aside by
  planned contributions out of what is left to spend. Category limits are never reserved on top of
  the overall limit. `remaining` is never below 0, and `dailyAllowance` is
  `remaining / period.remainingDays` rounded down to the cent, or `null` for a past month (no
  remaining days).
- `investments.items` lists the active investments, reserves, and goals by name with their
  `currentValue` and target `progress` ([`investments.md`](investments.md#investments)), and
  `investments.totalValue` sums their values. It is shown next to the balances, never added to them.
- `investments.contributions` and `investments.withdrawals` cover movements dated inside the period,
  of investments of any status: `completed`, `pending` (planned), and `total`. They are never income
  or expenses; planned ones already move `balances.projected`, so they lower `balances.available`
  and the balance-based daily allowance exactly once.
- Sums use integer cents (`sumMoney`) and are returned as decimal strings, so totals always equal the
  sum of the listed accounts.

## Acceptance

`test/e2e/mvp-acceptance.e2e-spec.ts` runs the product's acceptance scenarios through this endpoint
and checks that its totals reconcile: categories to `expenses.total`, accounts to the balances, and
`balances.available` to its parts. It also sweeps every financial route with another user and with an
admin, expecting the owner-scoped `404`.

## Configuration

None.
