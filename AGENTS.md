# API

NestJS 11 REST API: TypeScript, TypeORM, PostgreSQL, JWT cookies, nestjs-i18n, Jest, npm.

## Read before changing code

Always read [`docs/conventions.md`](docs/conventions.md). Then read what matches the area you change:

| Area | Document |
| --- | --- |
| `src/modules/<name>/` | `docs/modules/<name>.md`, the document named after the module folder (for example, `src/modules/auth/` → [`docs/modules/auth.md`](docs/modules/auth.md)) |
| `src/core/`, `src/shared/`, `src/main.ts`, `src/app.module.ts` | [`docs/core.md`](docs/core.md) |
| `Dockerfile`, `docker-compose.yml`, `.github/`, `scripts/`, `.env.example`, migrations, seeds | [`docs/infrastructure.md`](docs/infrastructure.md) |
| Purpose, module responsibilities, seeded data | [`docs/PROJECT.md`](docs/PROJECT.md) |

## Hard rules

- Layers: presentation → application → domain; controllers call use-cases only; explicit DTOs.
- Routes use the `endpoint()` builder; controllers are grouped by functional responsibility, not
  access level.
- Schema changes need `npm run migration:generate`; never edit generated migrations.
- New env vars go in `.env.example` and `env.validation.ts`; never commit `.env`.
- Update invalidated docs, translations (`pt-BR` + `en`), and Swagger in the same change.

## Gate

```sh
npm run lint:check && npm run typecheck && npm run test:cov && npm run test:integration && npm run test:e2e && npm run build
```
