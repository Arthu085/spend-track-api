# Recurrences module

> Location: `src/modules/recurrences/` · Rules: [financial data ownership](../conventions.md#financial-data-ownership)
> and [HTTP](../conventions.md#http) · Related: [`transactions.md`](transactions.md),
> [`credit-cards.md`](credit-cards.md), [`dashboard.md`](dashboard.md)

Recurring income, expenses, and card charges in `recurrences`, with their future occurrences
projected ahead of time. Account occurrences are planned `transactions`; card occurrences are
planned charges in `recurrence_card_charges` that become card purchases only when confirmed. Routes
and payloads are in Swagger; this document covers the rules behind them.

## Public API

- `index.ts`: `RECURRENCE_CARD_CHARGE_REPOSITORY`/`RecurrenceCardChargeRepository` with
  `PlannedCardChargeTotal`, `PlannedCardCharge`, and `PlannedCardChargesDue`, consumed by `dashboard`.
- `recurrences.module.ts`: `RecurrencesModule`. It imports `AccountsModule`, `CreditCardsModule`,
  `TransactionCategoriesModule`, and `TransactionsModule`; none of them imports it back.

## Ownership

Every route needs authentication but no ability and works only on the caller's recurrences. Lookups
filter by `user_id`, so a foreign recurrence is a `404` (`RecurrenceNotFoundError`) for everyone,
including admins. Occurrences are looked up inside their owned recurrence
(`RecurrenceOccurrenceNotFoundError`, `404`), and accounts, cards, and categories resolve through the
owner-scoped lookups of their modules.

## Template

- A recurrence has a `type` (`INCOME` or `EXPENSE`), a description, an amount, a category of the
  same kind (`RecurrenceCategoryKindMismatchError`, `422`), optional notes, a `frequency` (`WEEKLY`,
  `MONTHLY`, `YEARLY`), a `startDate`, and an optional `endDate` not before it
  (`RecurrenceEndBeforeStartError`, `422`).
- Its target is exactly one account or, for expenses only, one credit card
  (`InvalidRecurrenceTargetError`, `422`). The account, card, and category must be active when set.
  An account recurrence cannot start before the account's opening date
  ([`accounts.md`](accounts.md#opening-balance)).
- Occurrence `n` falls `n` weeks, months, or years after `startDate`. Monthly and yearly dates are
  shifted from the start date and clamped to the end of short months, so a recurrence starting on
  January 31 falls on February 28 and then March 31.
- `PATCH /recurrences/:uuid` changes `description`, `amount`, `categoryUuid`, `notes`, and, for
  account recurrences, `accountUuid`. `scope` decides which planned occurrences follow the new
  values: `FUTURE` those dated on or after `from` (default today), `ALL` every planned one. Moving a
  planned occurrence to an account that opens after its date is rejected. Completed and canceled
  occurrences never change. `type`, `frequency`, `startDate`, the card, and `endDate`
  never change through `PATCH`.

## State

`state` is `ACTIVE`, `PAUSED`, or `ENDED`. A recurrence whose `endDate` is before today is reported
and filtered as `ENDED` whatever its stored state. An ended recurrence rejects every write
(`RecurrenceEndedError`, `409`); its occurrences stay readable.

- `PUT /recurrences/:uuid/state` pauses (`ACTIVE → PAUSED`) or resumes (`PAUSED → ACTIVE`); anything
  else is `RecurrenceStateTransitionError` (`409`). Pausing removes the planned occurrences dated
  today or later; resuming generates again from today, so dates that fell during the pause are
  skipped.
- `PUT /recurrences/:uuid/end` stops the recurrence before a cut date and only ever shortens it:
  - `from`: no occurrence on or after that date (`endDate = from - 1`);
  - `fromInvoiceMonth` (card recurrences only, first day of a month; otherwise
    `RecurrenceInvoiceEndNotApplicableError`, `422`): no charge on that invoice or later. The cut is
    the first purchase date that would go to that invoice, from the stored invoice when it exists,
    otherwise from the card's current days;
  - neither, or a cut on or before `startDate`: the whole recurrence ends now (`state = ENDED`).

  Planned occurrences after the new end are soft-deleted. Completed and canceled ones, and every card
  purchase created by a confirmation, are kept. Canceling Netflix from the December invoice therefore
  keeps the November charge and generates nothing from December on.

## Occurrences

- `GET /recurrences/:uuid/occurrences` lists account transactions or card charges of the recurrence
  by date, with their `state` (`PLANNED`, `COMPLETED`, `CANCELED`). `GET /transactions` accepts
  `recurrenceUuid`, and every transaction carries its `recurrence` link (or `null`).
- `PATCH .../occurrences/:occurrenceUuid` changes the `amount` or `date` of one planned occurrence;
  a card charge moves to the invoice of its new date. `PUT .../confirmation` completes it with an
  optional `amount` and `date`, which may differ from the template. `PUT .../cancellation` cancels
  it. Each of these requires a planned occurrence (`RecurrenceOccurrenceNotPlannedError`, `409`).
- Confirming an account occurrence completes its transaction with `completedOn = date` (default
  today), keeps its scheduled `date`, and requires an active account. Neither date, nor a date set
  through `PATCH`, can be before the account's opening date. Confirming a card charge
  creates a single-installment card purchase on `date` (default the charge date) with the charge's
  description and category and the recurrence's notes, following every purchase
  rule in [`credit-cards.md`](credit-cards.md#purchases-and-installments), and links it to the charge.
- Planned account occurrences are ordinary planned transactions: they appear in projections and the
  dashboard, and the transactions routes can also edit, complete, cancel, or delete them. A planned
  card charge is not on an invoice until it is confirmed; the dashboard counts it separately
  ([`dashboard.md`](dashboard.md#figures)).

## Generation

- Occurrences are generated up to the last day of the twelfth month after the current one, never past
  `endDate`, only while the recurrence is `ACTIVE` and its account or card is active and not deleted.
  Dates before the account's opening date are skipped, never rejected, so generation does not fail
  on a recurrence older than that date.
- `generated_through` records the last date already generated and never moves back. Generation only
  creates dates after it, so an occurrence that was canceled, deleted, or moved is never recreated.
- Partial unique indexes on `(recurrence_id, recurrence_date)` in `transactions` and
  `(recurrence_id, occurrence_date)` in `recurrence_card_charges` (live rows only) reject a duplicate
  occurrence even if the cursor were wrong.
- Creating, resuming, or ending a recurrence generates immediately. `RecurrenceGenerationScheduler`
  runs daily at 01:00 `America/Sao_Paulo` and extends up to 500 due recurrences per run, each in its
  own transaction; the rest are picked up on the next run.

## Concurrency

Every write runs in one database transaction under the per-user account lock, then the per-user card
lock (the order every account and card write uses), then locks the recurrence row
(`FOR NO KEY UPDATE`) and re-reads it. The scheduler takes the same locks for each recurrence, so it
is safe on several replicas and never generates an occurrence twice.

## Configuration

None.
