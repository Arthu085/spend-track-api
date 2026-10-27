import type { Request } from 'express';
import { ACCESS_TOKEN_COOKIE } from '../http/auth-cookie.constants';

export function jwtCookieExtractor(req: Request): string | null {
  const signedValue: unknown = req.signedCookies[ACCESS_TOKEN_COOKIE];

  return typeof signedValue === 'string' ? signedValue : null;
}
