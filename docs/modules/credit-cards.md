# Credit cards module

> Location: `src/modules/credit-cards/` · Rules: [financial data ownership](../conventions.md#financial-data-ownership)
> and [HTTP](../conventions.md#http) · Related: [`accounts.md`](accounts.md),
> [`transaction-categories.md`](transaction-categories.md), [`dashboard.md`](dashboard.md)

The user's credit cards, their monthly invoices, purchases split into installments, refunds, and
invoice payments, in `credit_cards`, `credit_card_invoices`, `credit_card_purchases`,
`credit_card_installments`, `credit_card_refunds`, and `credit_card_payments`. Card purchases are
not `transactions`: they never change an account balance; only invoice payments do. Routes and
payloads are in Swagger; this document covers the rules behind them.

## Public API

- `index.ts`: `CreditCardEntity`, `CreditCardInvoiceStatus`, `InvoiceStatement`,
  `CREDIT_CARD_PURCHASE_REPOSITORY`/`CreditCardPurchaseRepository` with `CategorySpendingTotal`, and
  `CreditCardStatements`, consumed by `dashboard`; `CREDIT_CARD_REPOSITORY`/`CreditCardRepository`,
  `findOwnedCreditCard`, `InactiveCreditCardError`, `CreditCardInvoiceAssigner`,
  `CreateCreditCardPurchaseUseCase`, and
  `CREDIT_CARD_PENDING_OPERATIONS`/`CreditCardPendingOperationsRegistry`, consumed by `recurrences`.
- `presentation.ts`: `CreditCardInvoiceListResponseDto`, used by the dashboard response, and
  `CreditCardRefResponseDto`, used by the recurrence response.
- `persistence.ts`: `CreditCardMapper`, used by the recurrence mapper.
- `credit-cards.module.ts`: `CreditCardsModule`. It imports `AccountsModule` and
  `TransactionCategoriesModule`; neither imports it back.

## Ownership

Every route needs authentication but no ability and works only on the caller's records. Cards,
invoices, purchases, refunds, and payments carry `user_id` and every lookup filters by it, so a
foreign record is a `404` (`CreditCardNotFoundError`, `CreditCardInvoiceNotFoundError`,
`CreditCardPurchaseNotFoundError`, ...) for everyone, including admins. Refunds and payments are
looked up inside their owned purchase or invoice. Categories and accounts resolve through the
owner-scoped lookups of their modules, so a foreign one answers that module's `404`. List filters by
`cardUuid` or `categoryUuid` simply match nothing for a foreign or unknown uuid.

## Cards

- A card has a `name`, a `creditLimit` (informational, never enforced), a `closingDay` and a
  `dueDay` (1–31), a `status`, and an `isDefault` flag.
- At most one live card per user is the default (`uq_credit_cards_default_per_user`). Making a card
  the default clears the previous one under the per-user card lock. Archiving a card clears its flag,
  and a deleted card no longer counts toward the index.
- `outstanding` sums what is still owed on every invoice, `creditBalance` is the credit left over
  after the latest invoice, and `availableLimit` is `creditLimit - outstanding + creditBalance`.
- `PUT /credit-cards/:uuid/status` archives (`INACTIVE`) or reactivates a card. An archived card
  rejects new purchases, `GET /credit-cards/:uuid`, and `PATCH` (`InactiveCreditCardError`, `409`),
  like inactive accounts, but keeps its purchases and invoices, which stay readable and payable. `GET /credit-cards` defaults to `ACTIVE`, puts the default card
  first, then orders by name. See [Archiving with planned operations](#archiving-with-planned-operations).
- `DELETE` soft-deletes a card only while it has no purchase and no invoice payment, canceled or not;
  otherwise `CreditCardHasHistoryError` (`409`) and the user archives it instead. A payment can
  outlive its purchase as credit, which a deleted card could no longer use. Planned recurring charges
  do not block deletion: they stop counting ([`dashboard.md`](dashboard.md#figures)), and the
  recurrence generates nothing more.

## Archiving with planned operations

A card's pending operations are the planned recurring charges of its recurrences, whatever the state
of those recurrences. `CreditCardPendingOperationSources` (`CREDIT_CARD_PENDING_OPERATIONS`) is the
registry they are reached through, since `recurrences` depends on this module and not the reverse
([`recurrences.md`](recurrences.md#occurrences)). Purchases, installments, invoices, refunds, and
payments are recorded history: they are never pending, and archiving never changes them.

- `GET /credit-cards/:uuid/pending-operations` returns their `count` and `total`, for an active or an
  archived card.
- Moving a card from `ACTIVE` to `INACTIVE` with `PUT /credit-cards/:uuid/status` requires
  `pendingOperations` when it has any; otherwise `CreditCardPendingOperationsDecisionRequiredError`
  (`409`) and nothing changes. The body is not read in any other transition, so re-archiving and
  reactivating ignore it.
- `KEEP` leaves the charges planned. They keep counting in the dashboard
  ([`dashboard.md`](dashboard.md#figures)), and each one can still be confirmed, edited, or canceled.
  Confirming one creates its purchase on the archived card through `recordPlannedCharge`, the only
  way to add a purchase to it, and it can then be paid like any other invoice.
- `CANCEL` moves the charges to `CANCELED` with `canceledAt` in the same transaction, so they stay
  listed as history, stop counting, and are not generated again, including after the card is
  reactivated. It does not end their recurrences, which generate nothing while the card is archived
  and resume from `generated_through` once it is reactivated, unless they ended in the meantime.

## Invoice cycle

- An invoice is identified by its card and its **reference month**, the month of its due date
  (`referenceMonth` is the first day of that month).
- `dueDate` is `dueDay` of the reference month. `closingDate` is `closingDay` of the same month when
  `closingDay < dueDay`, otherwise of the previous month. Days past the end of a short month are
  clamped to its last day (`dayOfMonth` in `src/shared/domain/calendar/`).
- A purchase goes to the first invoice whose closing date is strictly after the purchase date, so a
  purchase on the closing day belongs to the next invoice. With `closingDay = 5` and `dueDay = 12`,
  a purchase on October 29 goes to the November invoice (closes November 5, due November 12), and a
  purchase on December 10 goes to the January invoice of the next year.
- Invoices are created on demand (`CreditCardInvoiceAssigner`) and store their own `closingDate` and
  `dueDate`. Changing a card's days only affects invoices created afterwards; existing invoices and
  their purchases keep their dates. The assigner skips a stored invoice that already closed on or
  before the date being placed.
- `referenceMonthFor` gives the invoice a date would go to without creating it, and `lastDateBefore`
  the last purchase date that still goes to the invoice before a given reference month (from the
  stored invoice when it exists, otherwise from the card's current days). Recurrences use them to
  place planned charges and to end a card recurrence from an invoice.

## Purchases and installments

- A purchase has a card, an `EXPENSE` category (`CreditCardPurchaseCategoryKindError`, `422`), a
  description, an amount, a purchase date, optional notes, and `installmentCount` (1–48).
- Installments split the amount in cents: every installment gets the floor of the division and the
  first one also gets the remainder, so they always add up to the total (`100.00` in 3 is `33.34`,
  `33.33`, `33.33`). An amount smaller than one cent per installment is
  `CreditCardInstallmentsExceedAmountError` (`422`).
- Installment `k` goes to the invoice `k - 1` months after the first one, and its `date` is the
  purchase date shifted by `k - 1` months (clamped).
- `PATCH` changes only `description`, `categoryUuid`, and `notes`; the amount, date, card, and
  installments never change. To correct them, delete and record the purchase again.
- A purchase is deletable (`deletable` in the response) only while every installment is on an open
  invoice and it has no refund; otherwise `CreditCardPurchaseNotDeletableError` (`409`).

## Refunds

- A refund belongs to a purchase and is credited to the card's invoice of the refund `date`, which
  may be later than the purchase's invoices. Several partial refunds may be recorded.
- The refund amount cannot exceed `refundableAmount` (the purchase amount minus earlier refunds;
  `CreditCardRefundExceedsPurchaseError`, `422`) and its date cannot be before the purchase date
  (`CreditCardRefundBeforePurchaseError`, `422`).
- A refund can be deleted only while its invoice is open; otherwise `CreditCardRefundNotDeletableError`
  (`409`).

## Invoice statements

Figures are computed on read from the stored entries (`buildInvoiceStatements`), per card in
reference-month order:

- `charges` sums the installments on the invoice, `refunds` the refunds credited to it, and `paid`
  its live payments.
- `previousCredit` is the previous invoice's `creditCarried`, and
  `total = charges - refunds - previousCredit`.
- `outstanding = max(total - paid, 0)` and `creditCarried = max(paid - total, 0)`. A refund on an
  already paid invoice, or one larger than the next invoice, therefore becomes credit on the
  following invoice instead of a negative balance.
- `status` is `OPEN` until the closing date, then `PAID` when nothing is outstanding, `OVERDUE`
  after the due date, and `CLOSED` otherwise. "Today" is `financeToday()`.

`GET /credit-cards/:uuid/invoices` lists a card's invoices newest first; `GET /credit-card-invoices/:uuid`
adds the charges (with installment number and count), refunds, and payments.

## Payments

- `POST /credit-card-invoices/:uuid/payments` pays an invoice from an active account of the caller,
  on `paidOn` (default today). Partial payments are allowed; a payment larger than the outstanding
  amount is `CreditCardPaymentExceedsOutstandingError` (`422`). An open invoice can be paid early.
  `paidOn` cannot be before the account's opening date
  ([`accounts.md`](accounts.md#opening-balance)).
- A payment is not an expense: spending is counted from purchases, so paying never counts twice.
- `CreditCardPaymentLedger` registers into the accounts ledger registry (`ACCOUNT_LEDGERS`, see
  [`accounts.md`](accounts.md#balances)) and subtracts every live payment from its account. Any
  payment, canceled or not, counts as account history.
- `PUT /credit-card-invoices/:uuid/payments/:paymentUuid/cancellation` cancels a payment: it stays
  listed with `canceledAt`, stops counting toward `paid` and the account balance, and cannot be
  canceled again (`CreditCardPaymentAlreadyCanceledError`, `409`).

## Historical settlements

A card can hold purchases older than the account that paid them: an account opening on December 1
with October and November invoices already paid. `openingBalance` already includes those payments
([`accounts.md`](accounts.md#opening-balance)), so a normal payment would count the money twice and is
rejected. A historical settlement records the fact without moving money.

- `POST /credit-card-invoices/:uuid/historical-settlements` takes `accountUuid`, `amount`, and `paidOn`,
  and stores a `credit_card_payments` row with `source = HISTORICAL_SETTLEMENT`. Normal payments are
  `ACCOUNT`; `source` and `sourceLabel` are in every payment response, and `historicalPaid` in the
  invoice detail sums the live settlements.
- `paidOn` must be strictly before the account's `openingBalanceDate` and not after today; otherwise
  `CreditCardHistoricalSettlementNotBeforeOpeningError` (`422`) points to a normal payment. The account
  is the one whose opening balance includes the money. It may be archived, and its opening date never
  changes.
- It counts toward `paid` like any payment, so statements, partial payments, carried credit, status,
  and later installments keep working as described in [Invoice statements](#invoice-statements). The
  amount cannot exceed the outstanding (`CreditCardPaymentExceedsOutstandingError`, `422`).
- `CreditCardPaymentLedger` leaves settlements out of `balanceChanges` and `earliestEntryDate`, since
  they neither change the balance nor hold back moving the opening date later. `hasEntries` still
  counts them as account history. `latestHistoricalEntryDate` keeps the opening date after them
  ([`accounts.md`](accounts.md#opening-balance)).
- The partial unique index `uq_credit_card_payments_historical_settlement` rejects a second live
  settlement with the same invoice, date, and amount (`CreditCardHistoricalSettlementDuplicateError`,
  `409`), so a repeated request cannot record it twice.
- To correct one, cancel it with the payment cancellation route and record it again. It stays listed
  with `canceledAt`, the invoice owes the amount again, no account balance changes, and both actions
  are audited (`CreditCardPayment.recordHistoricalSettlement`, `CreditCardPayment.cancel`).

## Concurrency

Every write runs in one database transaction under the per-user card lock
(`CreditCardRepository.lockOwnerCards`, a transaction-scoped advisory lock), so concurrent requests
never create the same invoice twice, overpay an invoice, or over-refund a purchase. Every write of a
planned charge holds that lock too, so archiving cancels them without any further lock. Paying and
canceling a payment or recording a historical settlement take the per-user account lock first, then the card lock, the same order as
every account write.

## Configuration

None.
