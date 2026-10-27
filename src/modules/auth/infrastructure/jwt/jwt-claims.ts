export const JWT_ALGORITHM = 'HS256';

export enum JwtTokenKind {
  ACCESS = 'access',
  REFRESH = 'refresh',
}

export const JWT_AUDIENCE: Record<JwtTokenKind, string> = {
  [JwtTokenKind.ACCESS]: 'auth:access',
  [JwtTokenKind.REFRESH]: 'auth:refresh',
};

export interface JwtTokenKindClaim {
  typ: JwtTokenKind;
}
