import type { Request } from 'express';
import { ACCESS_TOKEN_COOKIE } from '../../http/auth-cookie.constants';
import { jwtCookieExtractor } from '../jwt-cookie.extractor';

function buildRequest(overrides: {
  signedCookies?: Record<string, unknown>;
  cookies?: Record<string, unknown>;
  authorizationHeader?: string;
}): Request {
  return {
    signedCookies: overrides.signedCookies ?? {},
    cookies: overrides.cookies ?? {},
    headers: overrides.authorizationHeader
      ? { authorization: overrides.authorizationHeader }
      : {},
  } as unknown as Request;
}

describe('jwtCookieExtractor', () => {
  it('reads the access token from the signed cookie', () => {
    const request = buildRequest({
      signedCookies: { [ACCESS_TOKEN_COOKIE]: 'signed-token-value' },
    });

    expect(jwtCookieExtractor(request)).toBe('signed-token-value');
  });

  it('ignores an unsigned cookie when no signed value is present', () => {
    const request = buildRequest({
      cookies: { [ACCESS_TOKEN_COOKIE]: 'unsigned-token-value' },
    });

    expect(jwtCookieExtractor(request)).toBeNull();
  });

  it('returns null when a tampered signed cookie fails verification', () => {
    // cookie-parser exposes a signed cookie with an invalid signature as `false`
    const request = buildRequest({
      signedCookies: { [ACCESS_TOKEN_COOKIE]: false },
      cookies: { [ACCESS_TOKEN_COOKIE]: 'unsigned-token-value' },
    });

    expect(jwtCookieExtractor(request)).toBeNull();
  });

  it('returns null when the signed cookie is absent', () => {
    const request = buildRequest({});

    expect(jwtCookieExtractor(request)).toBeNull();
  });

  it('never reads the Authorization header, even when present', () => {
    const request = buildRequest({
      authorizationHeader: 'Bearer some-jwt-token',
    });

    expect(jwtCookieExtractor(request)).toBeNull();
  });

  it('returns the signed cookie even when a different unsigned one is present', () => {
    const request = buildRequest({
      signedCookies: { [ACCESS_TOKEN_COOKIE]: 'signed-value' },
      cookies: { [ACCESS_TOKEN_COOKIE]: 'unsigned-value' },
    });

    expect(jwtCookieExtractor(request)).toBe('signed-value');
  });
});
