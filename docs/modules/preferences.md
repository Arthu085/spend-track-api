# Preferences module

> Location: `src/modules/preferences/` · Rules: [financial data ownership](../conventions.md#financial-data-ownership)
> · Related: [`dashboard.md`](dashboard.md)

Per-user financial preferences in `user_preferences`, one row per user. Routes and payloads are in
Swagger; this document covers the rules behind them.

## Public API

- `index.ts`: `SpendingPerspective`, `DefaultMonth`, `resolveUserPreferences`, `UserPreferences`,
  and `USER_PREFERENCES_REPOSITORY`/`UserPreferencesRepository`, consumed by `dashboard`.
- `presentation.ts`: `spendingPerspectiveLabel`, used by the dashboard response.
- `preferences.module.ts`: `PreferencesModule`.

## Rules

- **Always the caller's own.** `GET /preferences` and `PATCH /preferences` need authentication but
  no ability and read the owner from the session; there is no route to another user's preferences.
- **Defaults without a row.** Until a user saves, reads return `PURCHASE_DATE` and `CURRENT` with a
  null `updatedAt` (`resolveUserPreferences`); nothing is written on read.
- **Partial update, upsert.** Omitted fields keep their value; the first save inserts the row and
  later saves update it (`ON CONFLICT (user_id)`), so concurrent saves never create a second row.
- **`spendingPerspective`** chooses whether a credit card purchase counts in the month of its purchase
  date or of its invoice. It only changes how months are grouped; stored dates never change. The
  dashboard can override it per request.
- **`defaultMonth`** is the month the dashboard opens on without an explicit month: the current or
  the next one.

## Configuration

None.
