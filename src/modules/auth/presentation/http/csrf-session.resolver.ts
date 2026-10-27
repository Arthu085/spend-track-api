import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import {
  TOKEN_SERVICE,
  type TokenService,
} from '../../application/ports/token-service.port';
import {
  ACCESS_TOKEN_COOKIE,
  CSRF_SESSION_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from './auth-cookie.constants';

function signedCookie(request: Request, name: string): string | null {
  const value: unknown = request.signedCookies[name];

  return typeof value === 'string' ? value : null;
}

@Injectable()
export class CsrfSessionResolver {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
  ) {}

  async resolve(request: Request): Promise<string | null> {
    const refreshToken = signedCookie(request, REFRESH_TOKEN_COOKIE);

    if (refreshToken !== null) {
      const payload = await this.tokenService.verifyRefreshToken(refreshToken);

      if (payload !== null) {
        return payload.sid;
      }
    }

    const accessToken = signedCookie(request, ACCESS_TOKEN_COOKIE);

    if (accessToken !== null) {
      const payload = await this.tokenService.verifyAccessToken(accessToken);

      if (payload !== null) {
        return payload.sid;
      }
    }

    return signedCookie(request, CSRF_SESSION_COOKIE);
  }
}
