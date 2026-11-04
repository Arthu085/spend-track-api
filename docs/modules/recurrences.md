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
- `RecurrenceCardChargePendingOperations` registers into the credit card pending operations registry
  ([`credit-cards.md`](credit-cards.md#archiving-with-planned-operations)).
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
and filtered as `ENDED` whatever its stored state.

`ENDED` is final and describes the recurrence, not the occurrences it leaves behind:

- The recurrence generates nothing more, cannot be paused or reactivated, and its template no longer
  changes. `PATCH /recurrences/:uuid`, `PUT .../state`, and `PUT .../end` answer
  `RecurrenceEndedError` (`409`).
- The planned occurrences it kept stay editable, confirmable, and cancelable
  ([Occurrences](#occurrences)), for account transactions and card charges alike. Completed and
  canceled occurrences keep their history and their usual state rules.

Pausing, resuming, and ending work as follows:

- `PUT /recurrences/:uuid/state` pauses (`ACTIVE → PAUSED`) or resumes (`PAUSED → ACTIVE`); anything
  else is `RecurrenceStateTransitionError` (`409`). Pausing removes the planned occurrences dated
  today or later; resuming generates again from today, so dates that fell during the pause are
  skipped. Completed and canceled occurrences stay as they are and are not generated again; a planned
  occurrence that was deleted before the pause can no longer be told apart from one the pause removed,
  so it comes back.
- `PUT /recurrences/:uuid/end` stops the recurrence before a cut date and only ever shortens it:
  - `from`: no occurrence on or after that date (`endDate = from - 1`);
  - `fromInvoiceMonth` (card recurrences only, first day of a month; otherwise
    `RecurrenceInvoiceEndNotApplicableError`, `422`): no charge on that invoice or later. The cut is
    the first purchase date that would go to that invoice, from the stored invoice when it exists,
    otherwise from the card's current days;
  - neither: the whole recurrence ends now (`state = ENDED`) and today becomes `endDate`, or the
    earlier `endDate` it already had. A recurrence that has not started keeps its `endDate`;
  - a cut on or before `startDate`: it also ends now (`state = ENDED`), and no scheduled date is left
    to keep.

  Every form follows the same rule, for account transactions and card charges alike: planned
  occurrences scheduled after the effective end are soft-deleted, and those up to it are kept.
  "Scheduled" means `occurrenceDate`, so a planned occurrence moved before the recurrence ended
  follows its original schedule. Completed and canceled occurrences, and every card purchase created
  by a confirmation, are always kept. Canceling Netflix from the December invoice therefore keeps the
  November charge, which can still be confirmed, edited, or canceled, and generates nothing from
  December on.

## Occurrences

- `GET /recurrences/:uuid/occurrences` lists account transactions or card charges of the recurrence
  by date, with their `state` (`PLANNED`, `COMPLETED`, `CANCELED`). `GET /transactions` accepts
  `recurrenceUuid`, and every transaction carries its `recurrence` link (or `null`).
- `PATCH .../occurrences/:occurrenceUuid` changes the `amount` or `date` of one planned occurrence;
  a card charge moves to the invoice of its new date. `PUT .../confirmation` completes it with an
  optional `amount` and `date`, which may differ from the template. `PUT .../cancellation` cancels
  it. Each of these requires a planned occurrence (`RecurrenceOccurrenceNotPlannedError`, `409`), and
  none of them depends on the state of the recurrence, so they keep working once it is `ENDED`. They
  change only the occurrence, never the template.
- An occurrence has three dates. `occurrenceDate` is its original place in the schedule and never
  changes. `date` is its expected date while planned. `PATCH` cannot move it past the recurrence's
  `endDate`, through the transactions routes either (`OccurrenceAfterRecurrenceEndError`, `422`).
  `completedOn` is when it actually happened, so a confirmation may be dated after `endDate`. A
  confirmed card charge also takes that date as its `date`, because it is the purchase date.
- Confirming an account occurrence completes its transaction with `completedOn = date` (default
  today), keeps its scheduled `date`, and requires an active account. Neither date, nor a date set
  through `PATCH`, can be before the account's opening date. Confirming a card charge
  creates a single-installment card purchase on `date` (default the charge date) with the charge's
  description and category and the recurrence's notes, following every purchase
  rule in [`credit-cards.md`](credit-cards.md#purchases-and-installments), and links it to the charge.
  The card may be archived: charges kept when it was archived stay confirmable
  ([`credit-cards.md`](credit-cards.md#archiving-with-planned-operations)).
- Planned account occurrences are ordinary planned transactions, whatever the state of their
  recurrence: they appear in projections and the dashboard, and the transactions routes can also
  edit, complete, cancel, or delete them. A planned card charge is not on an invoice until it is
  confirmed; the dashboard counts it separately ([`dashboard.md`](dashboard.md#figures)).

## Generation

- Occurrences are generated up to the last day of the twelfth month after the current one, never past
  `endDate`, only while the recurrence is `ACTIVE` and its account or card is active and not deleted.
  Generation goes by the reported state: once `endDate` has passed it creates nothing, even for dates
  up to `endDate` that `generated_through` never reached, for example because the card was archived
  until then or because the recurrence was created with an `endDate` already in the past.
  Dates before the account's opening date are skipped, never rejected, so generation does not fail
  on a recurrence older than that date. A skipped date does not come back if the opening date later
  moves earlier, because `generated_through` has already passed it. A later pause and resume can only
  bring back dates from that day on.
- `generated_through` records the last date already generated, and only pausing moves it back.
  Generation only creates dates after it, and skips dates that already have a live occurrence, so an
  occurrence that was canceled, confirmed, or moved is never recreated.
- Partial unique indexes on `(recurrence_id, recurrence_date)` in `transactions` and
  `(recurrence_id, occurrence_date)` in `recurrence_card_charges` (live rows only) reject a duplicate
  occurrence even if generation were wrong.
- Creating, resuming, or ending a recurrence generates immediately, unless it is already `ENDED`.
  `RecurrenceGenerationScheduler` runs daily at 01:00 `America/Sao_Paulo` and extends up to 500 due
  recurrences per run, oldest first, each in its own transaction. A recurrence past its `endDate` is
  never due. A recurrence that fails is rolled back and logged, stays due for the next run, and does
  not stop the ones after it. Extended recurrences stop being due, so any past the 500 limit are
  reached on later runs. Failures are not counted or backed off: 500 or more recurrences that keep
  failing would fill every batch and block the ones after them until they are fixed.

## Concurrency

Every write runs in one database transaction under the per-user account lock, then the per-user card
lock (the order every account and card write uses), then locks the recurrence row
(`FOR NO KEY UPDATE`) and re-reads it. The scheduler takes the same locks for each recurrence, so it
is safe on several replicas and never generates an occurrence twice.

## Configuration

None.
