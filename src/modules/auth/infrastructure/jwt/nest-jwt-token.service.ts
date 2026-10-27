import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from '@core/config';
import { SECOND_IN_MS } from '@shared/application/time';
import {
  AccessTokenPayload,
  RefreshTokenPayload,
  TokenService,
} from '../../application/ports/token-service.port';
import { JWT_ALGORITHM, JWT_AUDIENCE, JwtTokenKind } from './jwt-claims';
import { parseDurationMs } from './parse-duration';

function hasStringClaims(
  value: unknown,
  kind: JwtTokenKind,
  claims: readonly string[],
): value is Record<string, string> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    record.typ === kind &&
    claims.every((claim) => typeof record[claim] === 'string')
  );
}

function isAccessTokenPayload(value: unknown): value is AccessTokenPayload {
  return hasStringClaims(value, JwtTokenKind.ACCESS, ['sub', 'email', 'sid']);
}

function isRefreshTokenPayload(value: unknown): value is RefreshTokenPayload {
  return hasStringClaims(value, JwtTokenKind.REFRESH, ['sub', 'jti', 'sid']);
}

@Injectable()
export class NestJwtTokenService implements TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: AppConfigService,
  ) {}

  signAccessToken(payload: AccessTokenPayload): string {
    return this.jwtService.sign(
      { ...payload, typ: JwtTokenKind.ACCESS },
      {
        secret: this.config.jwt.accessSecret,
        expiresIn: this.ttlSeconds(this.config.jwt.accessTtl),
        algorithm: JWT_ALGORITHM,
        audience: JWT_AUDIENCE[JwtTokenKind.ACCESS],
      },
    );
  }

  signRefreshToken(payload: RefreshTokenPayload): string {
    return this.jwtService.sign(
      { ...payload, typ: JwtTokenKind.REFRESH },
      {
        secret: this.config.jwt.refreshSecret,
        expiresIn: this.ttlSeconds(this.config.jwt.refreshTtl),
        algorithm: JWT_ALGORITHM,
        audience: JWT_AUDIENCE[JwtTokenKind.REFRESH],
      },
    );
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
    const decoded = await this.verify(
      token,
      this.config.jwt.accessSecret,
      JwtTokenKind.ACCESS,
    );

    return isAccessTokenPayload(decoded) ? decoded : null;
  }

  async verifyRefreshToken(token: string): Promise<RefreshTokenPayload | null> {
    const decoded = await this.verify(
      token,
      this.config.jwt.refreshSecret,
      JwtTokenKind.REFRESH,
    );

    return isRefreshTokenPayload(decoded) ? decoded : null;
  }

  accessTtlMs(): number {
    return parseDurationMs(this.config.jwt.accessTtl);
  }

  refreshTtlMs(): number {
    return parseDurationMs(this.config.jwt.refreshTtl);
  }

  private async verify(
    token: string,
    secret: string,
    kind: JwtTokenKind,
  ): Promise<unknown> {
    try {
      return await this.jwtService.verifyAsync<object>(token, {
        secret,
        algorithms: [JWT_ALGORITHM],
        audience: JWT_AUDIENCE[kind],
      });
    } catch {
      return null;
    }
  }

  private ttlSeconds(ttl: string): number {
    return Math.floor(parseDurationMs(ttl) / SECOND_IN_MS);
  }
}
