export const EMAIL_CHANGE_TOKEN_REVOKERS = Symbol(
  'EMAIL_CHANGE_TOKEN_REVOKERS',
);

export interface EmailChangeTokenRevoker {
  revokeAllForUser(userId: number): Promise<void>;
}

export interface EmailChangeTokenRevokerRegistry extends EmailChangeTokenRevoker {
  register(revoker: EmailChangeTokenRevoker): void;
}
