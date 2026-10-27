export const USER_SESSION_REVOKERS = Symbol('USER_SESSION_REVOKERS');

export interface UserSessionRevoker {
  revokeAllForUser(userId: number): Promise<void>;
}

export interface UserSessionRevokerRegistry extends UserSessionRevoker {
  register(revoker: UserSessionRevoker): void;
}
