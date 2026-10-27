# Auth module

> Location: `src/modules/auth/` · Rules: [security, authentication, and authorization](../conventions.md#security-authentication-and-authorization)
> · Related: [`users.md`](users.md), [`email-outbox.md`](email-outbox.md)

Login, refresh, logout, password recovery, and CSRF token issuance. The module also binds the global
CSRF, JWT, and ability guards. There is **no self-registration** and **no `GET /auth/me`**:
`GET /users/me` returns the profile, and `login` and `refresh` already return the same
`UserDetailResponseDto`. Routes and payloads are in Swagger; this document covers the rules behind
them.

## Cookies and tokens

| Cookie | Content | Path | Attributes |
| --- | --- | --- | --- |
| `access_token` | Access JWT (`JWT_ACCESS_TTL`, default 15m) | `/api` | httpOnly, signed |
| `refresh_token` | Refresh JWT (`JWT_REFRESH_TTL`, default 7d) | `/api/auth/refresh` | httpOnly, signed |
| `csrf_session` | Session id for CSRF binding, with the refresh TTL | `/api` | httpOnly, signed |
| `csrf_token` | CSRF token, sent back in `X-CSRF-Token` | `/api` | readable by scripts, unsigned |

All cookies use `COOKIE_SECURE`, `COOKIE_SAMESITE`, and `COOKIE_DOMAIN`, and are signed with
`COOKIE_SECRET` where marked. Tokens are never returned in a body or read from an `Authorization`
header.

- **Tokens carry their kind.** Access and refresh JWTs use separate secrets, are signed and verified
  with `HS256` only, and carry `typ` (`access`/`refresh`) and a matching `aud`
  (`auth:access`/`auth:refresh`). Verification rejects a token of the wrong kind, so neither can
  stand in for the other even if the secrets were shared.
- **Both carry the session id** (`sid`), minted at login and copied into every rotated pair. Only the
  holder of the JWT secrets can choose it. CSRF tokens are bound to it.
- **Refresh tokens are stored as SHA-256 digests** (`TokenHasher`) with their `session_id`, and
  rotated on every use.

## Login

- **Fixed check order:** invalid credentials → inactive user → unconfirmed email. Unknown email and
  wrong password are the same `InvalidCredentialsError`, and the confirmation check runs strictly
  after password verification, so `login` is not an account-existence or confirmation oracle.
  `refresh` and per-request token validation use the same order.
- **Comparable timing.** When no user matches, the password is still verified against a dummy argon2
  hash (computed once at startup), so unknown and known emails do the same hashing work.
- **Length cap, no minimum.** `LoginDto` rejects passwords over 128 characters (and emails over 255)
  before argon2 runs, but requires only a non-empty password, so raising the password policy never
  locks out existing accounts. `reset-password` enforces the full 8–128 range and the
  [password strength rule](users.md#input-rules).
- **Re-checked under the lock.** After verifying the password outside any lock, login locks the user
  row, repeats the status and confirmation checks, and rejects if the password hash changed in the
  meantime, so a password checked just before a reset commits cannot open a session after it.
- **Audit actor.** `login` and `refresh` are public, so their handlers call `attachAuditActor` with
  the resolved user; a failed attempt keeps `userId: null` ([`audit.md`](audit.md)).

## Sessions

A session is one login: its refresh-token rows share a `session_id`. **The session is live while it
has an unrevoked, unexpired refresh row.**

### Every request re-checks the session

`ValidateAccessTokenUserUseCase` runs on every authenticated request. It loads the user by the
token's `sub` with `findAuthSubject` (one lean query: auth fields and role names, no password hash or
abilities), rejects a missing or inactive user, checks `hasActiveSession(userId, sid)`, and then
checks email confirmation. A
deactivated, deleted, or signed-out user's access token therefore fails on its next request instead
of at expiry, with the same `401` as any invalid token. The session check runs before the
confirmation check, so a revoked session never reveals `EmailNotConfirmedError`.

Access tokens keep working across rotation, because the session keeps a live row. This holds as long
as `JWT_REFRESH_TTL` is longer than `JWT_ACCESS_TTL`; configured the other way round, access tokens
stop working when their row expires.

### Refresh rotation and reuse detection

Rotation revokes the old row (`revoked_at`, `replaced_by_uuid`) and inserts the new one in one
transaction, after locking the user row and repeating the status and confirmation checks on it, so
an email change that commits in between still blocks the refresh. The claim is a conditional `UPDATE ... WHERE uuid = $1 AND revoked_at IS NULL`; only the
winner issues a new pair, so concurrent replays of the same token cannot both succeed.

A refresh JWT with a valid signature whose row still exists is treated as **theft**, and every
session of the user is revoked, when:

- its raw value does not match the stored hash;
- its row is already revoked (by rotation, logout, or reset), meaning a copy is still in circulation;
- a concurrent request rotated the same row first.

The revocation commits in its own transaction, so it survives the rejection. An expired row or an
unknown jti is rejected without revoking anything, and the row owner must match the JWT subject.
Every failure returns the same `InvalidRefreshTokenError` (`401`); the only distinct outcome is
`EmailNotConfirmedError`, reached after the token is fully validated.

Detection has **no grace window**: two simultaneous refreshes with the same cookie (two tabs) sign
every session out, so clients must serialize refresh calls. Reuse detection only covers revoked rows
still in the table ([Token cleanup](#token-cleanup)).

### What ends every session

Logout, password reset, deactivation, deletion, a user changing their own profile or password, and
detected refresh reuse all revoke **every** refresh row of the user, which also ends every access token on its
next request. Logout means "sign out everywhere", and is the user's way to end a session on a lost or
shared device. `users` triggers its cases through the `USER_SESSION_REVOKERS` registry, where `auth`
registers `RefreshTokenSessionRevoker` ([`users.md`](users.md#sessions-and-tokens)).

### Session writes serialize on the user row

Every operation that creates or revokes sessions (login, rotation, logout, reuse revocation, password
reset, and the `users` revocations) first locks the user row (`FOR NO KEY UPDATE`) in its
transaction, always before any refresh-token row. Without it, a login or refresh in flight during a
revocation could commit a row the revocation never saw. With it, whichever operation locks second
sees the first one's result.

## Password recovery

- **Forgot-password only schedules.** `RequestPasswordResetUseCase` calls `EmailOutboxPort.schedule`
  for the submitted address without any account lookup and always returns the same `200`; a denied or
  failed schedule is indistinguishable from success
  ([`email-outbox.md`](email-outbox.md#anti-enumeration)).
- **The token is minted at delivery.** The `PASSWORD_RESET` handler resolves the account by the job's
  recipient, then in one transaction locks the user, issues nothing unless it is still `ACTIVE` and
  still has that email, supersedes earlier reset tokens, and stores the new digest. It sends the link
  (`APP_WEB_URL` + `MAIL_RESET_PASSWORD_PATH`) in the job's locale after the commit. Only the latest
  email's link works, and `PASSWORD_RESET_TOKEN_TTL_MINUTES` starts at delivery.
- **Every failure looks the same.** A malformed, unknown, expired, consumed, or mismatched token, or
  a missing or inactive owner, is one `InvalidPasswordResetTokenError` (`422`). The owner's status is
  checked at redemption, so deactivation voids links already sent.
- **Reset is one transaction.** After hashing the new password outside it, the reset locks the user
  row, re-checks `ACTIVE`, claims the token with a conditional `UPDATE ... AND consumed_at IS NULL`,
  writes the password onto the locked row, consumes every other reset token, and revokes every
  session. The user lock comes first so concurrent resets for the same user serialize instead of
  deadlocking; the loser gets the generic `422` and only one new password commits.
- **Reset also confirms the email.** Proving control of the reset link is at least as strong as a
  confirmation link, so an unconfirmed user becomes confirmed; a confirmed user keeps the original
  timestamp.
- **Email changes void reset links.** `auth` registers `PasswordResetTokenEmailChangeRevoker` in
  `users`' `EMAIL_CHANGE_TOKEN_REVOKERS`, so an email change consumes every outstanding reset token in
  its transaction. A link sent to a previous address can neither set a password nor confirm the new
  address ([`users.md`](users.md#sessions-and-tokens)).
- **Password changes void reset links.** `auth` registers `PasswordResetTokenPasswordChangeRevoker` in
  `users`' `PASSWORD_CHANGE_TOKEN_REVOKERS`, so `PATCH /users/me/password` consumes every outstanding
  reset token in its transaction
  ([`users.md`](users.md#self-service-password-change)).

## Guards and CSRF

`auth.module.ts` binds `CsrfGuard`, `JwtAuthGuard`, and `AbilitiesGuard` as global guards, in that
order and in one place, so their relative order does not depend on `AppModule`'s import list.
`AbilitiesGuard` belongs to `authorization` and is bound with `useExisting` to reuse that module's
instance. The full chain is in [`core.md`](../core.md#global-guards).

**`.public()` exempts a route from `JwtAuthGuard`, not from `CsrfGuard`.** CSRF exempts only `GET`,
`HEAD`, and `OPTIONS`, so `login`, `refresh`, `forgot-password`, and `reset-password` also need the
`X-CSRF-Token` header. This is intentional.

### Session-bound CSRF tokens

`csrf_token` is `<nonce>.<hmac>`: a random 32-byte hex nonce and
`HMAC-SHA256(COOKIE_SECRET, "csrf-token:<sid>:<nonce>")`. The token does not contain the `sid`.
`CsrfGuard` requires the header to equal the cookie and the HMAC to verify for the request's session,
both compared in constant time. Plain double-submit trusts any matching pair, and a signature alone
does not say for whom it was minted; binding to a session the attacker cannot choose stops a sibling
subdomain from planting a usable token (cookie tossing).

`CsrfSessionResolver` takes the request's session from the first that applies, verifying JWT
signatures without database access:

1. the `sid` of a valid `refresh_token` cookie (sent only to `/api/auth/refresh`);
2. the `sid` of a valid `access_token` cookie;
3. the signed `csrf_session` cookie.

Without any of them, `CsrfGuard` answers `403`. `csrf_session` decides only for requests without a
valid credential: before login (`GET /auth/csrf` starts an anonymous pre-session), when bootstrapping
without an access token, and on a protected request with an expired access token, where CSRF passes
and `JwtAuthGuard` answers the `401` that tells the client to refresh.

| Event | Session the token is bound to | Token |
| --- | --- | --- |
| `GET /auth/csrf`, anonymous | `csrf_session`, or a new pre-session | Kept if already bound, otherwise minted |
| `GET /auth/csrf`, signed in | The access token's `sid`, else `csrf_session` | Kept if already bound, otherwise minted |
| `login` (also when already signed in) | A new session | Replaced; the old token stops working |
| `refresh` | Unchanged | Kept |
| `logout` | None; all auth and CSRF cookies are cleared | Bootstrap again |
| `COOKIE_SECRET` rotated | Every `csrf_session` and token stops verifying | Bootstrap again |

`GET /auth/csrf`, `login`, and `refresh` set `csrf_session` and `csrf_token` and return the token in
the `X-CSRF-Token` response header (exposed by CORS). `GET /auth/csrf` also returns it as
`data.csrfToken` with `Cache-Control: no-store`, for frontends on another origin that cannot read the
cookie. The token is useless without its cookie and session, and origins outside `CORS_ORIGINS`
cannot read it.

Guarantees:

- A token verifies for one session only; copying it to another browser, user, or session fails, and
  so does a token from before the latest login.
- Against a signed-in victim, a tossed `csrf_token` + `csrf_session` pair fails because the check
  binds to the victim's own access or refresh token.
- No server-side CSRF store: the session id lives in the signed JWTs and one signed cookie.

### Known CSRF limitations

- **Pre-sessions are obtainable by anyone.** An attacker who can toss cookies and also send
  `X-CSRF-Token` (an origin in `CORS_ORIGINS` or script on the API origin) can plant a complete
  pre-session pair for requests without a valid credential, for example login CSRF into the
  attacker's account.
- **Auth cookies can be tossed.** A sibling subdomain can plant its own signed auth cookies, signing
  the victim into the attacker's account. `__Host-` prefixes would prevent this but require `Path=/`.
  Keep `COOKIE_DOMAIN` empty and host no untrusted content on sibling subdomains.
- **Same-origin script wins.** XSS on the API origin or an allowed frontend can read a token from
  `GET /auth/csrf`; CSRF defenses do not address XSS.
- **A revoked session still binds CSRF until its access token expires**, because the resolver does
  not query the database. The request still fails at `JwtAuthGuard` with `401`.
- **`csrf_session` must survive with the refresh cookie.** If only it is lost, `refresh` answers
  `403` until the user signs in again.

## Frontend integration

1. On start, call `GET /api/auth/csrf` with credentials and keep `data.csrfToken` in memory.
2. Send every request with credentials (`credentials: 'include'` / `withCredentials: true`).
3. Send the token in `X-CSRF-Token` on every `POST`, `PUT`, `PATCH`, and `DELETE`, including
   `login`, `refresh`, `forgot-password`, and `reset-password`.
4. Whenever a response carries an `X-CSRF-Token` header, replace the stored token. `login` always
   changes it; keeping the old one makes the next unsafe request fail with `403`.
5. After `logout`, drop the token and bootstrap again. If an unsafe request fails with the invalid
   CSRF token `403`, fetch a new token before retrying. Never replay requests automatically on any
   `403`: the body has no CSRF-specific code, and a handler's own `403` may follow side effects.

```ts
const API = 'http://localhost:3000/api';
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

let csrfToken: string | undefined;

async function loadCsrfToken(): Promise<string> {
  const response = await fetch(`${API}/auth/csrf`, { credentials: 'include' });
  const body = (await response.json()) as { data: { csrfToken: string } };

  csrfToken = body.data.csrfToken;

  return csrfToken;
}

export async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);

  if (UNSAFE.has(method)) {
    headers.set('X-CSRF-Token', csrfToken ?? (await loadCsrfToken()));
  }

  const response = await fetch(`${API}${path}`, { ...init, method, headers, credentials: 'include' });

  csrfToken = response.headers.get('X-CSRF-Token') ?? csrfToken;

  return response;
}

export function forgetCsrfToken(): void {
  csrfToken = undefined;
}
```

With Axios, apply the same pattern with request and response interceptors. Do not rely on Axios's
`xsrfCookieName`/`xsrfHeaderName`, which read `document.cookie` and fail for frontends that cannot
see the cookie.

### Deployment shapes

| Frontend vs. API | Example | Settings |
| --- | --- | --- |
| Same origin (reverse proxy or dev-server proxy for `/api`) | `https://app.example.com` → `https://app.example.com/api` | Defaults; no CORS needed |
| Same site, different origin | `http://localhost:5173` → `http://localhost:3000`; `https://app.example.com` → `https://api.example.com` | `CORS_ORIGINS=<frontend origin>`, `COOKIE_SAMESITE=lax` (or `strict`) |
| Different sites | `https://app.example.com` → `https://api.other.net` | `CORS_ORIGINS=<frontend origin>`, `COOKIE_SAMESITE=none`, `COOKIE_SECURE=true`. Browsers that block third-party cookies still drop them; prefer the shapes above |

Leave `COOKIE_DOMAIN` empty: host-only cookies work for all three shapes, and a parent domain would
expose the auth cookies to every sibling subdomain. With `COOKIE_SECURE=true` (required in
production) every origin involved must be HTTPS.

## Token cleanup

`AuthTokenCleanupScheduler` runs hourly and prunes both token tables; each pass catches its own
failure, and a pass whose retention variable is `0` is skipped.

- **Password-reset tokens** are batch-deleted once `expires_at` is more than
  `PASSWORD_RESET_TOKEN_RETENTION_DAYS` in the past ([shared retention contract](../core.md#scheduling-and-retention)).
- **Refresh tokens** are deleted in two unbatched passes: every row past `expires_at`, then revoked
  rows older than `REFRESH_TOKEN_RETENTION_DAYS`. Revoked rows are kept for reuse detection and
  forensics until the first cutoff; with the defaults the expiry pass always comes first. A replayed
  token whose row was pruned is an unknown jti and revokes nothing. `REFRESH_TOKEN_RETENTION_DAYS=0`
  skips both passes, so expired rows are kept too.

## Configuration

`JWT_ACCESS_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_TTL`, `COOKIE_SECRET`,
`COOKIE_SECURE`, `COOKIE_SAMESITE`, `COOKIE_DOMAIN`, `PASSWORD_RESET_TOKEN_TTL_MINUTES`,
`MAIL_RESET_PASSWORD_PATH`, `REFRESH_TOKEN_RETENTION_DAYS`, and `PASSWORD_RESET_TOKEN_RETENTION_DAYS`.
Production requirements are in [`infrastructure.md`](../infrastructure.md#configuration).

## Not included

- No self-registration and no `GET /auth/me`.
- No password-change route: a signed-in user changes their password through `users`'
  `PATCH /users/me/password` ([`users.md`](users.md#self-service-password-change)).
- No ability check on `logout`: any authenticated user may sign themselves out.
- Real email delivery is opt-in: with `MAIL_TRANSPORT=log` the reset link is written to the log
  ([`users.md`](users.md#notifications)).
- `assertEmailConfirmed` is imported from `@modules/users` as a plain function, not injected through
  a port; it has no dependencies to bind.
