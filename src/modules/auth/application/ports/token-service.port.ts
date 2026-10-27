export const TOKEN_SERVICE = Symbol('TOKEN_SERVICE');

export interface AccessTokenPayload {
  sub: string;
  email: string;
  sid: string;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  sid: string;
}

export interface TokenService {
  signAccessToken(payload: AccessTokenPayload): string;
  signRefreshToken(payload: RefreshTokenPayload): string;
  verifyAccessToken(token: string): Promise<AccessTokenPayload | null>;
  verifyRefreshToken(token: string): Promise<RefreshTokenPayload | null>;
  accessTtlMs(): number;
  refreshTtlMs(): number;
}
