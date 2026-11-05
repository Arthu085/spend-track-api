# Recurrences module

> Location: `src/modules/recurrences/` · Rules: [financial data ownership](../conventions.md#financial-data-ownership)
> and [HTTP](../conventions.md#http) · Related: [`transactions.md`](transactions.md),
> [`credit-cards.md`](credit-cards.md), [`investments.md`](investments.md), [`dashboard.md`](dashboard.md)

Recurring income, expenses, card charges, and investment contributions in `recurrences`, with their
future occurrences projected ahead of time. Account occurrences are planned `transactions`; card
occurrences are planned charges in `recurrence_card_charges` that become card purchases only when
confirmed; contribution occurrences are planned `MANDATORY` `investment_movements`. Routes and
payloads are in Swagger; this document covers the rules behind them.

## Public API

- `index.ts`: `RECURRENCE_CARD_CHARGE_REPOSITORY`/`RecurrenceCardChargeRepository` with
  `PlannedCardChargeTotal`, `PlannedCardCharge`, and `PlannedCardChargesDue`, and `SavingPlans` with
  `SavingPlan`, consumed by `dashboard`.
- `presentation.ts`: `SavingPlanResponseDto`, used by the dashboard response.
- `RecurrenceCardChargePendingOperations` registers into the credit card pending operations registry
  ([`credit-cards.md`](credit-cards.md#archiving-with-planned-operations)).
- `recurrences.module.ts`: `RecurrencesModule`. It imports `AccountsModule`, `CreditCardsModule`,
  `InvestmentsModule`, `TransactionCategoriesModule`, and `TransactionsModule`; none of them imports
  it back.

## Ownership

Every route needs authentication but no ability and works only on the caller's recurrences. Lookups
filter by `user_id`, so a foreign recurrence is a `404` (`RecurrenceNotFoundError`) for everyone,
including admins. Occurrences are looked up inside their owned recurrence
(`RecurrenceOccurrenceNotFoundError`, `404`), and accounts, cards, and categories resolve through the
owner-scoped lookups of their modules. So does the investment of a contribution.

## Template

- A recurrence has a `type` (`INCOME`, `EXPENSE`, or `INVESTMENT_CONTRIBUTION`), a description, an
  amount, a category of the same kind (`RecurrenceCategoryKindMismatchError`, `422`; a contribution
  has none), optional notes, a `frequency` (`WEEKLY`,
  `MONTHLY`, `YEARLY`), a `startDate`, and an optional `endDate` not before it
  (`RecurrenceEndBeforeStartError`, `422`).
- Its target is exactly one account or, for expenses only, one credit card
  (`InvalidRecurrenceTargetError`, `422`). The account, card, and category must be active when set.
  An account recurrence cannot start before the account's opening date
  ([`accounts.md`](accounts.md#opening-balance)).
- `INVESTMENT_CONTRIBUTION` needs `investmentUuid` and `accountUuid`, both active, and forbids
  `categoryUuid` and `creditCardUuid`. The investment never changes afterward.
- Occurrence `n` falls `n` weeks, months, or years after `startDate`. Monthly and yearly dates are
  shifted from the start date and clamped to the end of short months, so a recurrence starting on
  January 31 falls on February 28 and then March 31.
- `PATCH /recurrences/:uuid` changes `description`, `amount`, `categoryUuid`, `notes`, and, for
  account recurrences, `accountUuid`. `scope` decides which planned occurrences follow the new
  values: `FUTURE` those dated on or after `from` (default today), `ALL` every planned one. On an
  investment contribution only a sent `amount` or `accountUuid` reaches them, and each keeps whichever
  of the two was not sent, so a change per occurrence survives a `PATCH` of the other field or of
  `description`, `notes`, or `savingStrategy`. Moving a
  planned occurrence to an account that opens after its date is rejected. Completed and canceled
  occurrences never change. `type`, `frequency`, `startDate`, the card, and `endDate`
  never change through `PATCH`. For a contribution, `PATCH` also takes `savingStrategy`
  ([Saving plans](#saving-plans)); sending `categoryUuid` is `RecurrenceCategoryKindMismatchError`.

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

## Investment contributions

- A contribution occurrence is one `investment_movements` row of kind `MANDATORY`, always generated
  as `PLANNED`, linked by `recurrence_id` and `recurrence_date`
  ([`investments.md`](investments.md#contribution-kinds)). It lowers the projected balance while
  planned, moves money only once confirmed, and is never income or an expense.
- `PATCH`, `PUT .../confirmation`, and `PUT .../cancellation` follow the rules above. Confirming sets
  `completedOn = date` (default today), keeps the scheduled `date`, needs an active account, checks
  the value through `InvestmentValues`, and also works on an archived investment. The occurrence
  carries `movementUuid`, and `PUT /investments/:uuid/movements/:movementUuid/state` can also complete
  or cancel it.
- Pausing, ending, and the `PATCH` scope only touch planned `MANDATORY` rows of that recurrence, by
  soft delete when removing. A planned `ADDITIONAL` row is an explicit user decision and stays.
- Archiving the investment with `KEEP` leaves planned rows confirmable and stops generation.
  With `CANCEL` the rows stay `CANCELED` and their dates are never generated again, even after
  reactivating it.

## Saving plans

`savingStrategy` (`minimumRetainedBalance` ≥ 0 and `additionalContribution`: `NONE` or
`REMAINING_SURPLUS`) is optional and only valid on a `MONTHLY` `INVESTMENT_CONTRIBUTION`; otherwise
`InvalidSavingStrategyError` (`422`). The mandatory contribution is the recurrence `amount`. `PATCH`
sets or clears it and never changes existing movements.

`GET /recurrences/saving-plans?year=&month=` returns one plan per recurrence with a strategy, reported
as `ACTIVE`, whose investment and account are active and not deleted, for a month from the month of
`startDate` through the month of `endDate`. `SavingPlans` reads primitive balances and
`savingPlanOf` computes everything else; nothing derived is stored, so it never depends on
`balances.available` and a suggestion never changes a dashboard balance. For a month ending on `E`:

| Figure                      | Value                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| `actualBalance`             | The account's current balance                                                                    |
| `plannedTransactions`       | Net planned transactions on the account dated up to `E`                                          |
| `mandatory.planned`         | This recurrence's planned `MANDATORY` rows on its account dated up to `E`, overdue ones included |
| `otherInvestmentMovements`  | Net planned movements on the account dated up to `E`, with `mandatory.planned` added back        |
| `cardObligations`           | `creditCards.outstanding + creditCards.plannedDue` of the dashboard for the month                |
| `balanceBeforeContribution` | `actualBalance + plannedTransactions + otherInvestmentMovements − cardObligations`               |
| `distributable`             | `balanceBeforeContribution − minimumRetainedBalance`                                             |
| `shortfall`                 | `max(mandatory.planned − distributable, 0)`                                                      |
| `suggestedAdditional`       | `max(distributable − mandatory.planned, 0)` when an additional contribution can be accepted      |

- Adding `mandatory.planned` back is the double-count guard: this recurrence's own mandatory rows
  leave the balance, while other investments and its own planned `ADDITIONAL` row still reduce it.
- A planned row left on a former account, by a `FUTURE` scope that did not reach it, does not draw
  from the current account, so the plan does not count or list it. It stays in the occurrences.
- Cards are not linked to accounts, so all card obligations are charged against this account: a
  conservative estimate, exposed so the UI can say so. The invoice selection is shared with the
  dashboard through `statementsDueInMonth`.
- Suggestions on a shared account overlap: each plan offers the same surplus until one of them is
  accepted. Accepting one, even as `PLANNED`, lowers the others through `otherInvestmentMovements`,
  so they must never be added together.
- `canAcceptAdditional` is true with `REMAINING_SURPLUS`, for the current or a later month, and while
  the month has no live additional contribution. Only then is `suggestedAdditional` above 0.

`POST /recurrences/:uuid/additional-contributions` records what the user accepts; nothing is created
automatically. `amount` may differ from the suggestion. The movement is `ADDITIONAL`, with
`suggestedAmount` and `retainedMinimum` as an immutable snapshot, so later changes to the strategy
never rewrite history.

- `date` must be inside the month (`AdditionalContributionOutsideMonthError`, `422`), defaults to today
  in the current month and to the first day of a later one, and cannot be before the account's
  opening date.
- `COMPLETED` needs a date up to today (`CompletedAdditionalContributionInFutureError`, `422`), since
  it moves the money now. `PLANNED` may be dated in the future.
- A month before the current one is `SavingPlanMonthClosedError` (`422`).
- The recurrence must be `ACTIVE` with `REMAINING_SURPLUS`, and the month within the months of
  `startDate` and `endDate` (`SavingPlanNotActiveError`, `409`, also for a month before `startDate`
  that has already passed). Its investment and account must be active and not deleted
  (`InactiveInvestmentError`, `InactiveAccountError`, `409`).
- One live contribution per recurrence and month: a repeat is
  `AdditionalContributionAlreadyExistsError` (`409`), also from a partial unique index. Canceling it
  through the investment movement state route frees the month.

## Generation

- Occurrences are generated up to the last day of the twelfth month after the current one, never past
  `endDate`, only while the recurrence is `ACTIVE`, its account or card is active and not deleted, and,
  for a contribution, its investment is too.
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
  `investment_movements` (`MANDATORY` rows) and `(recurrence_id, occurrence_date)` in
  `recurrence_card_charges` (live rows only) reject a duplicate occurrence even if generation were
  wrong.
- Creating, resuming, or ending a recurrence generates immediately, unless it is already `ENDED`.
  `RecurrenceGenerationScheduler` runs daily at 01:00 `America/Sao_Paulo` and extends up to 500 due
  recurrences per run, oldest first, each in its own transaction. A recurrence past its `endDate` is
  never due. A recurrence that fails is rolled back and logged, stays due for the next run, and does
  not stop the ones after it. Extended recurrences stop being due, so any past the 500 limit are
  reached on later runs. Failures are not counted or backed off: 500 or more recurrences that keep
  failing would fill every batch and block the ones after them until they are fixed.

## Concurrency

Every write runs in one database transaction under the per-user account lock, then the per-user card
lock, then the per-user investment lock (the order every write across them uses), then locks the
recurrence row
(`FOR NO KEY UPDATE`) and re-reads it. The scheduler takes the same locks for each recurrence, so it
is safe on several replicas and never generates an occurrence twice.

## Configuration

None.
