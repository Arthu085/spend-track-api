export const PASSWORD_CHANGE_TOKEN_REVOKERS = Symbol(
  'PASSWORD_CHANGE_TOKEN_REVOKERS',
);

export interface PasswordChangeTokenRevoker {
  revokeAllForUser(userId: number): Promise<void>;
}

export interface PasswordChangeTokenRevokerRegistry extends PasswordChangeTokenRevoker {
  register(revoker: PasswordChangeTokenRevoker): void;
}
