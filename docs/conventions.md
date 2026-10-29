# Engineering conventions

The rules every change to this repository follows. The mechanisms behind these rules are
in [`core.md`](core.md), module-specific decisions in [`modules/`](modules), and product context in
[`PROJECT.md`](PROJECT.md).

## Architecture

- Stack: Node.js 24, NestJS 11, TypeScript, Express, TypeORM, PostgreSQL, `@nestjs/config` with Joi,
  class-validator, Passport JWT in cookies, nestjs-i18n, Pino, Swagger, Jest. npm is the package
  manager and `package-lock.json` is the source of truth.
- Layout: `src/core/` framework wiring, `src/modules/` self-contained business modules,
  `src/shared/` domain-agnostic building blocks, `src/main.ts` composition root.
- Dependencies point inward: presentation → application → domain. Infrastructure implements domain
  and application ports. The domain layer stays free of Nest and TypeORM.
- Controllers call use-cases, never repositories. DTOs never expose domain or ORM entities.

## Modules

```text
modules/<name>/
├── domain/{entities,repositories,errors}/
├── application/{use-cases,services,ports}/
├── infrastructure/persistence/{entities,mappers,repositories}/
├── presentation/controllers/ and presentation/dto/{input,output}/
├── index.ts, presentation.ts, persistence.ts   (only when other modules consume them)
└── <name>.module.ts
```

- Other modules, `src/core/`, and `AppModule` import a module only through its root entry points:
  - `index.ts`: framework-free domain and application contracts, importable from any layer;
  - `presentation.ts`: guards, DTOs, and HTTP constants reused by another module's presentation;
  - `persistence.ts`: ORM entities, mappers, and seeders reused by another module's adapters or
    seeders, or by `src/core/database/seeds`;
  - `<name>.module.ts`.

  Export only what another module uses.

- ESLint (`no-restricted-imports`) rejects imports of another module's `infrastructure/` or
  `presentation/` folders and any `presentation` import from a `domain/` or `application/` layer.
  Deep imports of another module's `domain/` or `application/` are not linted but are still
  forbidden. `__tests__/` specs and `test/` are exempt.
- Exception: an ORM entity (`*.orm-entity.ts`) imports another module's ORM entity file directly for
  a relation, never through a barrel, which could pull in mappers and seeders and form an import
  cycle.
- Domain entities and value objects are pure. Repository interfaces are domain ports; use-cases depend on ports; ORM rows map to domain objects through explicit
  mappers. A module may skip the domain entity and mapper only when its repository port deals in
  primitives or plain records, as `email-quota` and `email-outbox` do.
- When a module must trigger behavior owned by a module that depends on it, it exposes a port and
  a registry that the dependent module registers into (see the revoker registries in
  [`modules/users.md`](modules/users.md#sessions-and-tokens)). Ports used by shared presentation code
  live in `src/shared/`.
- Files are kebab-case with role suffixes (`*.use-case.ts`, `*.orm-entity.ts`, `*.controller.ts`);
  classes are PascalCase matching their role. No `any`. Separate multiline `const` object and config
  blocks with blank lines.

### Adding a module

Order of work: domain entities and repository ports; use-cases; TypeORM entities, mappers,
and adapters; DTOs and controllers; port wiring in `<name>.module.ts`; route abilities and catalog
entries; `pt-BR` and `en` translations; a migration and idempotent seeds; tests; Swagger; docs,
including a `docs/modules/<name>.md` and a row in [`PROJECT.md`](PROJECT.md#modules).

## HTTP

- Every route uses the `endpoint()` builder from `@shared/presentation/builders`, applied as
  `@(endpoint()...build())`, never bare Nest route decorators. It owns verb, path, status, guards,
  interceptors, pipes, throttling, auditing, and Swagger metadata; `@Controller(path)` and parameter
  decorators stay on the controller.
- Routes are authenticated by default. `.public()` opts a single route out of `JwtAuthGuard` only;
  CSRF still applies to every unsafe method.
- Controllers are grouped by functional responsibility and named for the capability they expose
  (`UsersManagementController`, `UsersProfileController`, `AuthSessionsController`,
  `PasswordRecoveryController`), never by access level. They live in
  `presentation/controllers/<capability>.controller.ts`, stay registered in their owning module, and
  carry no class-level guards or metadata: each route declares its own access, ability, throttling,
  and audit rules. Add a controller for a distinct responsibility, not because a file grew; no
  controller per endpoint and no base controllers.
- Nest registers routes in module `controllers` order and Express serves the first match: register a
  controller with static paths (`/users/me`) before one whose parameterized paths would match them
  (`/users/:uuid`), and keep the module's `__tests__/<name>.module.spec.ts` route inventory and
  `shadowedRoutes` check current.
- Handlers within a controller are ordered `GET → POST → PATCH → PUT → DELETE`.
- Global prefix `/api`, no URI versioning.
- Success responses are `{ data, meta }`; `meta.message` is set only through
  `.successMessage('<i18n-key>')`.
- Paginated routes take a query DTO extending `PaginationQueryDto` (`page` ≥ 1, default 1; `limit`
  1–50, default 20), return a `PaginatedResult` (map items with `result.map(fn)`), and declare
  `.paginatedResponse(<ItemDto>)`. The response has the items in `data` and
  `{ total, page, limit }` in `meta`.
- Errors come from the global filter with `statusCode`, `error`, `message`, `timestamp`, and `path`.
  Only a `MissingAbilityError` 403 adds `requiredAbilities`, and only an unexpected 500 on an audited
  route adds `auditId`.
- Every endpoint has accurate Swagger metadata. `build()` documents the shared error responses from
  route traits (401 and unconfirmed-email 403 unless `.public()`, CSRF 403 on unsafe methods, ability
  403, and 429 unless `.skipThrottle()`); declare route-specific domain errors with `.errorResponse(HttpStatus.X, '<description>')`,
  never `.use(ApiResponse(...))`. DTO validation 400s are not documented this way.
- Public credential and token routes, and authenticated routes that verify a password, use
  `.use(PublicAuthFlowThrottle())` for the stricter `AUTH_THROTTLE_*` budget. Health probes use
  `.skipThrottle()`.
- Auditing is opt-in with `.audit('<Subject>.<action>')`. Never record bodies, headers, cookies, or
  query strings.
- `status` (`ACTIVE`/`INACTIVE`) and `deletedAt` are independent axes. `PUT .../:uuid/status` toggles
  status reversibly; `DELETE .../:uuid` soft-deletes irreversibly; neither changes the other.
- After the not-found check, single-record GET and UPDATE use-cases call `assertRecordActive` with
  the module's `Inactive*Error` (`409`). DELETE and the status toggle are exempt.

### Output DTOs

- When the detail view exposes more fields than the collection view, use
  `<name>-list.response.ts` (`<Name>ListResponseDto`) and `<name>-detail.response.ts`
  (`<Name>DetailResponseDto extends <Name>ListResponseDto`); otherwise a single
  `<name>.response.ts`. Collection GETs return the list DTO; single-resource GETs and mutations that
  return a resource return the detail DTO.
- The list DTO owns `protected static assignBase(dto, entity, translate)`; each `fromDomain` creates
  its own instance and calls `this.assignBase(...)`. Do not re-declare inherited `@ApiProperty`
  fields; use `declare` to change an inherited nested field's Swagger type.
- Detail DTOs embed detail relations unless that causes a cycle, a duplicate fetch, or excessive
  depth. List DTOs embed a relation only when it identifies the row, using its list variant.

## Security, authentication, and authorization

- Required app-wide: Helmet, an explicit CORS allowlist with credentials (never a wildcard), signed
  cookies, CSRF protection, rate limiting, and graceful shutdown. They are wired once in
  [`core.md`](core.md#bootstrap-and-request-pipeline); do not bypass them per route.
- Auth tokens travel only in signed httpOnly cookies. Never return them in a body or read an
  `Authorization` header. State-changing requests send the CSRF token in `X-CSRF-Token`. Mechanism:
  [`modules/auth.md`](modules/auth.md).
- No self-registration endpoint.
- Human passwords are hashed with argon2 through `PasswordHasher`. High-entropy machine tokens
  (refresh, password reset, email confirmation) go through `TokenHasher` (SHA-256, constant-time
  comparison). Never mix the two.
- One-time tokens are claimed with a conditional `UPDATE` inside a transaction and rejected unless
  exactly one row changed. Token-redeeming endpoints collapse every failure into one generic error.
- Protected handlers receive the caller through `@CurrentActor() actor: AuthenticatedUser`
  (`@shared/presentation/decorators`), never `@Req()`. Cross-cutting code reads the same shape
  through `RequestWithActor`.
- An ability is an `(Action, Subject)` enum pair typed as `AbilityPair`, never a string. Users have
  many roles; effective abilities are the union of their active roles' grants. The catalog is defined
  in code and seeded; there is no runtime CRUD for it.
- `.ability({ action, subject })` requirements are ANDed. UPDATE and DELETE routes also require READ
  on the same subject; CREATE does not.
- Abilities and the access token's user and session are re-checked against the database on every
  request, so revocations apply immediately.

## Financial data ownership

Every financial record (accounts, personal transaction categories, preferences, transactions, and the records later phases
add) belongs to exactly one user through a `user_id` FK, and only that user can read or change it.

- **Ownership is enforced by the API, never by the client.** Financial routes need authentication
  but no ability, take the owner from `@CurrentActor()` (`actor.id`), and never accept an owner from
  the request. Repositories filter by owner in the query itself (`findByUuidForOwner`,
  `findAllByOwner`, `findVisibleByUuid`), so a record outside the caller's scope is never loaded.
- **Abilities and roles never widen it.** `ADMIN` and every other ability apply to administrative
  features only; an admin reaches another user's finances exactly like any other user: not at all.
- **Foreign records are not found.** A record owned by someone else answers `404` with the module's
  not-found error, the same as a missing one, so its existence never leaks. Reserve `403` for rules
  about the target itself, such as read-only global transaction categories.
- **References are checked too.** A record that points at another financial record (a transaction
  and its account or category) resolves that reference through the same owner-scoped lookup.
- **Money is exact.** Amounts are integer cents in the domain (`parseMoney`, `formatMoney`,
  `sumMoney` in `src/shared/domain/money/`), `numeric(14,2)` in PostgreSQL, and decimal strings with
  up to two decimal places (`MoneyField`) over HTTP, never JSON numbers. SQL `numeric` sums can exceed
  the 12 integer digits of a single amount, so they are parsed with `parseMoneyTotal`. Calendar dates without a
  time are `YYYY-MM-DD` strings (`DateOnlyField`, `date` columns). The MVP assumes BRL and the
  `America/Sao_Paulo` calendar (`financeToday` in `src/shared/domain/calendar/`).

## Persistence

- `synchronize` is false everywhere. Schema changes need a generated migration
  (`npm run migration:generate --name=<kebab-description>`); use `migration:create` only for custom
  migrations. Never edit, reformat, or lint-fix files in `src/core/database/migrations/`.
- Migrations must stay compatible with the previous release (expand first, contract later); see
  [`infrastructure.md`](infrastructure.md#migrations-and-rolling-deployments).
- Public `uuid` columns use `generated: 'uuid'` with `uuidExtension: 'pgcrypto'`; never declare a
  raw `gen_random_uuid()` default, which TypeORM reports as drift in every generated migration.
- Business records (`users`, `roles`, `abilities`) extend `BaseOrmEntity`/`BaseEntity`: `id`, `uuid`,
  `created_at`, `status`, `updated_at`, and soft-delete `deleted_at`. Mappers leave `updated_at`
  unset on insert. Technical and append-only tables (tokens, `audit_logs`, `email_outbox`,
  `email_send_logs`) extend `BaseTechnicalOrmEntity`/`BaseTechnicalEntity` (`id`, `uuid`,
  `created_at` only): they are never deactivated or soft-deleted, record state in explicit columns,
  and are hard-deleted by retention jobs where one exists (`user_change_requests` is kept as
  history).
- Repository adapters extend `BaseTransactionalRepository`; one that does not silently escapes
  transactions. Use-cases with more than one write use `TransactionManagerPort.runInTransaction(...)`.
  Nested calls join the outer transaction; use `runInSavepoint(...)` only for a nested step whose
  failure the caller tolerates. Audit writes never run inside a transaction.
- Flows that touch both a user row and its token rows lock the user row first
  (`findByIdForUpdate`/`findByUuidForUpdate`, `FOR NO KEY UPDATE`) and write the row they locked,
  never an earlier snapshot.
- Relations use a numeric FK to `id`. Actor columns (`created_by`, `updated_by`, `deleted_by`) are
  `int` FKs to `users.id` with `ON DELETE SET NULL`, filled from the `@CurrentActor()` user's `id`;
  resolve actor names at read time with `withDeleted: true`. `audit_logs.user_id` is the exception: a
  uuid with no FK. Index an actor column only when a query filters on it.
- A repository adapter maps a unique violation with a domain meaning to its domain error with
  `isUniqueViolation(error, '<constraint>')`, matching the constraint name, never every `23505`.
- Seeds provision roles, abilities, and the initial admin, mirror the ability catalog, and stay
  idempotent and non-destructive: they insert what is missing and never reset runtime-changed data.
  A seeder whose prerequisite is missing throws. New seeds land with the module that owns the data.
- Raw SQL in a `SelectQueryBuilder` uses full table names. In multiline subqueries, align `SELECT`,
  `FROM`, and `WHERE`, and indent columns, joins, and extra `AND` conditions one level deeper.

## Logging

- Warnings and errors are structured objects with a constant `msg` and context in separate fields:
  `logger.error({ msg, ...fields, error: describeError(error) })`. Never log interpolated strings,
  raw caught errors, or raw `req`/`res` objects.
- Mask personal data with the helpers in `src/shared/application/logging/` (`maskEmail`,
  `redactEmails`, `describeError`). Never log secrets, tokens, or cookies (log redaction is described
  in [`core.md`](core.md#logging)).

## i18n and configuration

- Engineering artifacts are English. User-facing strings use nestjs-i18n with `pt-BR` (default and
  fallback) and `en`; every key exists in both. Validation messages use `i18nValidationMessage`.
- Localized labels are additive companions sharing the field stem (`status` + `statusLabel`).
- Controllers receive a request-bound translator through `@Translator() translate: Translate` and
  pass it to output DTO `fromDomain` mappers.
- A new variable goes in `.env.example` and in `src/core/config/validation/env.validation.ts`, the
  only place defaults are declared. `registerAs` factories read `validateEnv(<namespace>EnvSchema)`,
  never `process.env` with fallbacks. Never commit `.env`.

## Testing

Required gate before shipping; CI runs the same commands:

```sh
npm run lint:check && npm run typecheck && npm run test:cov && npm run test:integration && npm run test:e2e && npm run build
```

- Unit specs (`src/**/__tests__/*.spec.ts`) use mocked ports and no I/O. Their environment is
  hermetic (`test/unit/setup-env.ts`); a spec that needs other values sets them itself. Coverage must
  stay at or above 80% globally.
- Integration specs (`src/**/__tests__/*.integration.spec.ts`) and e2e specs
  (`test/e2e/*.e2e-spec.ts`) run against disposable PostgreSQL Testcontainers, never a developer
  database. Each run hands its connection to workers through the `TEST_DB_CONNECTION` env var, never
  a shared file, so concurrent runs stay isolated. E2E workers clear `THROTTLE_REDIS_URL`
  (`test/e2e/setup-env.ts`), so a local `.env` Redis is never used; specs that need Redis start
  their own container. Integration runs ignore `.claude/` so agent worktrees inside the checkout are
  never collected. `test/` holds only e2e specs and test infrastructure.
- Jest `globalSetup` files run outside `moduleNameMapper` and must start with
  `import 'tsconfig-paths/register';`.
- E2E specs create apps with `createTestApp()` (`test/e2e/helpers/create-test-app.ts`), which applies
  the production `configureApp()` pipeline; paths include the `/api` prefix. Never build an app with
  `Test.createTestingModule()` and `createNestApplication()` directly in a spec.
- Shared fixtures live in `test/support/` behind the `@test/*` alias. Build domain entities with
  `test/support/builders/` (`buildUser`, `buildNewUser`) and partial doubles with `mockOf<T>(...)`
  rather than `as unknown as T`. Migrate older specs as they are touched.
- Lint must pass with zero warnings. `no-floating-promises` and `no-unsafe-argument` are errors:
  await every promise, or use `void` only when the callee or a chained `.catch()` handles rejection.
  Disable a rule only on the specific line, with a reason.

## Delivery

- Documentation invalidated by a change is part of it: the module doc for module rules and
  decisions, [`core.md`](core.md) for cross-cutting mechanisms, [`infrastructure.md`](infrastructure.md)
  for configuration and operations, [`PROJECT.md`](PROJECT.md) for module responsibilities and seeded
  data, and Swagger for every route change. Each fact has one primary location; link to it instead of
  repeating it.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
  (`type(scope): subject`). This is a team convention: no hook or CI step enforces it; reviewers do.
