# Categories module

> Location: `src/modules/categories/` · Rules: [financial data ownership](../conventions.md#financial-data-ownership)
> and [HTTP](../conventions.md#http)

Income and expense categories in `categories`: a fixed global catalog shared by every user and
personal categories that belong to one user. Routes and payloads are in Swagger; this document
covers the rules behind them.

## Public API

- `persistence.ts`: `GlobalCategoriesSeeder`, run by `src/core/database/seeds`.
- `categories.module.ts`: `CategoriesModule`.

## Scope and visibility

- A category is **global** when `user_id` is null and **personal** otherwise. The check constraint
  `chk_categories_scope` ties scope to the catalog `code`: global rows always have one, personal rows
  never do.
- Every user sees the global catalog plus their own personal categories. Another user's personal
  category is a `404` (`CategoryNotFoundError`), including for admins, because lookups apply the
  visibility rule in the query.
- Routes need authentication but no ability.
- `GET /categories` is paginated like every list (`page`, `limit`), defaults to `ACTIVE`, and orders
  by kind, then stored name.

## Editing rules

- Users create, rename, recolor, deactivate, and reactivate only their personal categories.
- **Global categories are read-only for everyone**, admins included: `PATCH` and the status toggle
  answer `GlobalCategoryReadOnlyError` (`403`). There is no API to manage the catalog.
- `kind` (`INCOME`/`EXPENSE`) is fixed at creation, so records that use a category always match its
  type.
- There is no delete. Deactivating (`PUT /categories/:uuid/status`) removes a category from the
  default `ACTIVE` list while records that use it keep it. `GET` and `PATCH` reject an inactive
  category with `InactiveCategoryError` (`409`).
- Names are not unique; `color` is an optional `#RRGGBB` value.

## Global catalog

`GLOBAL_CATEGORIES` (`domain/catalog/global-categories.ts`) defines each global category's stable
`code`, kind, English fallback name, and color. Responses name global categories through
`categories.global.<code>` in the request language and fall back to the stored name; personal
categories use their stored name. Lists are ordered by kind and stored name, so clients sort
localized names themselves.

`GlobalCategoriesSeeder` inserts each missing code and never updates or deletes a row, soft-deleted
rows included, so a changed definition reaches only fresh databases.

## Configuration

None.
