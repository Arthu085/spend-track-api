import type { CookieOptions, Response } from 'express';
import type { AppConfigService } from '@core/config';
import { CSRF_HEADER_NAME } from '@shared/presentation/http';
import {
  ACCESS_COOKIE_PATH,
  ACCESS_TOKEN_COOKIE,
  CSRF_SESSION_COOKIE,
  CSRF_TOKEN_COOKIE,
  REFRESH_COOKIE_PATH,
  REFRESH_TOKEN_COOKIE,
} from './auth-cookie.constants';
import { createCsrfToken, isCsrfTokenBoundTo } from './csrf-token';

type CookieConfig = AppConfigService['cookie'];

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTtlMs: number;
  refreshTtlMs: number;
}

export interface SessionCookies extends AuthTokens {
  sessionId: string;
}

export interface CsrfBinding {
  sessionId: string;
  ttlMs: number;
}

function baseCookieOptions(cookieCfg: CookieConfig): CookieOptions {
  const options: CookieOptions = {
    secure: cookieCfg.secure,
    sameSite: cookieCfg.sameSite,
  };

  if (cookieCfg.domain !== '') {
    options.domain = cookieCfg.domain;
  }

  return options;
}

export function setAuthCookies(
  res: Response,
  tokens: AuthTokens,
  cookieCfg: CookieConfig,
): void {
  const base = baseCookieOptions(cookieCfg);

  res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    ...base,
    httpOnly: true,
    signed: true,
    path: ACCESS_COOKIE_PATH,
    maxAge: tokens.accessTtlMs,
  });

  res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    ...base,
    httpOnly: true,
    signed: true,
    path: REFRESH_COOKIE_PATH,
    maxAge: tokens.refreshTtlMs,
  });
}

export function clearAuthCookies(res: Response, cookieCfg: CookieConfig): void {
  const base = baseCookieOptions(cookieCfg);

  res.clearCookie(ACCESS_TOKEN_COOKIE, { ...base, path: ACCESS_COOKIE_PATH });
  res.clearCookie(REFRESH_TOKEN_COOKIE, {
    ...base,
    path: REFRESH_COOKIE_PATH,
  });
  res.clearCookie(CSRF_TOKEN_COOKIE, { ...base, path: ACCESS_COOKIE_PATH });
  res.clearCookie(CSRF_SESSION_COOKIE, { ...base, path: ACCESS_COOKIE_PATH });
}

export function issueCsrfCookies(
  res: Response,
  cookieCfg: CookieConfig,
  binding: CsrfBinding,
  currentToken?: unknown,
): string {
  const token =
    typeof currentToken === 'string' &&
    isCsrfTokenBoundTo(currentToken, binding.sessionId, cookieCfg.secret)
      ? currentToken
      : createCsrfToken(binding.sessionId, cookieCfg.secret);

  const base = baseCookieOptions(cookieCfg);

  res.cookie(CSRF_SESSION_COOKIE, binding.sessionId, {
    ...base,
    httpOnly: true,
    signed: true,
    path: ACCESS_COOKIE_PATH,
    maxAge: binding.ttlMs,
  });

  res.cookie(CSRF_TOKEN_COOKIE, token, {
    ...base,
    httpOnly: false,
    signed: false,
    path: ACCESS_COOKIE_PATH,
  });

  res.setHeader(CSRF_HEADER_NAME, token);

  return token;
}

export function issueSessionCookies(
  res: Response,
  session: SessionCookies,
  cookieCfg: CookieConfig,
  currentCsrfToken: unknown,
): void {
  setAuthCookies(res, session, cookieCfg);
  issueCsrfCookies(
    res,
    cookieCfg,
    { sessionId: session.sessionId, ttlMs: session.refreshTtlMs },
    currentCsrfToken,
  );
}
