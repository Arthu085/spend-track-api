import type { PasswordChangeTokenRevokerRegistry } from '@modules/users';
import type { PasswordResetTokenRepository } from '../../../domain/repositories/password-reset-token.repository';
import { PasswordResetTokenPasswordChangeRevoker } from '../password-reset-token-password-change-revoker';
import { mockOf } from '@test/support/mocks/mock-of';

describe('PasswordResetTokenPasswordChangeRevoker', () => {
  it('registers itself with the users password-change registry on module init', () => {
    const register = jest.fn();

    const revoker = new PasswordResetTokenPasswordChangeRevoker(
      mockOf<PasswordResetTokenRepository>(),
      mockOf<PasswordChangeTokenRevokerRegistry>({ register }),
    );

    revoker.onModuleInit();

    expect(register).toHaveBeenCalledWith(revoker);
  });

  it('consumes every outstanding reset token of the user', async () => {
    const consumeAllForUser = jest.fn().mockResolvedValue(undefined);

    const revoker = new PasswordResetTokenPasswordChangeRevoker(
      mockOf<PasswordResetTokenRepository>({ consumeAllForUser }),
      mockOf<PasswordChangeTokenRevokerRegistry>(),
    );

    await revoker.revokeAllForUser(7);

    expect(consumeAllForUser).toHaveBeenCalledWith(7);
  });
});
