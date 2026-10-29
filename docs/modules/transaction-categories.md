# Transaction categories module

> Location: `src/modules/transaction-categories/` · Rules: [financial data ownership](../conventions.md#financial-data-ownership)
> and [HTTP](../conventions.md#http)

Income and expense categories in `transaction_categories`: a fixed global catalog shared by every user and
personal categories that belong to one user. Routes and payloads are in Swagger; this document
covers the rules behind them.

## Public API

- `persistence.ts`: `GlobalTransactionCategoriesSeeder`, run by `src/core/database/seeds`.
- `transaction-categories.module.ts`: `TransactionCategoriesModule`.

## Scope and visibility

- A category is **global** when `user_id` is null and **personal** otherwise. The check constraint
  `chk_transaction_categories_scope` ties scope to the catalog `code`: global rows always have one, personal rows
  never do.
- Every user sees the global catalog plus their own personal categories. Another user's personal
  category is a `404` (`TransactionCategoryNotFoundError`), including for admins, because lookups apply the
  visibility rule in the query.
- Routes need authentication but no ability.
- `GET /transaction-categories` is paginated like every list (`page`, `limit`), defaults to `ACTIVE`, and orders
  by kind, then stored name.

## Editing rules

- Users create, rename, recolor, deactivate, reactivate, and delete only their personal categories.
- **Global categories are read-only for everyone**, admins included: `PATCH`, the status toggle, and
  `DELETE` answer `GlobalTransactionCategoryReadOnlyError` (`403`). There is no API to manage the catalog.
- `kind` (`INCOME`/`EXPENSE`) is fixed at creation, so records that use a category always match its
  type.
- Deactivating (`PUT /transaction-categories/:uuid/status`) removes a category from the default `ACTIVE` list
  while records that use it keep it. `DELETE /transaction-categories/:uuid` soft-deletes a personal category,
  removing it from every list; until transactions exist there is no history to check first. `GET` and `PATCH` reject an inactive
  category with `InactiveTransactionCategoryError` (`409`).
- Names are not unique; `color` is an optional `#RRGGBB` value.

## Global catalog

`GLOBAL_TRANSACTION_CATEGORIES` (`domain/catalog/global-transaction-categories.ts`) defines each global category's stable
`code`, kind, English fallback name, and color. Responses name global categories through
`transaction_categories.global.<code>` in the request language and fall back to the stored name; personal
categories use their stored name. Lists are ordered by kind and stored name, so clients sort
localized names themselves.

`GlobalTransactionCategoriesSeeder` inserts each missing code and never updates or deletes a row, soft-deleted
rows included, so a changed definition reaches only fresh databases.

## Configuration

None.
