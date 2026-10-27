import type { EmailChangeTokenRevokerRegistry } from '@modules/users';
import type { PasswordResetTokenRepository } from '../../../domain/repositories/password-reset-token.repository';
import { PasswordResetTokenEmailChangeRevoker } from '../password-reset-token-email-change-revoker';
import { mockOf } from '@test/support/mocks/mock-of';

describe('PasswordResetTokenEmailChangeRevoker', () => {
  it('registers itself with the users email-change registry on module init', () => {
    const register = jest.fn();

    const revoker = new PasswordResetTokenEmailChangeRevoker(
      mockOf<PasswordResetTokenRepository>(),
      mockOf<EmailChangeTokenRevokerRegistry>({ register }),
    );

    revoker.onModuleInit();

    expect(register).toHaveBeenCalledWith(revoker);
  });

  it('consumes every outstanding reset token of the user', async () => {
    const consumeAllForUser = jest.fn().mockResolvedValue(undefined);

    const revoker = new PasswordResetTokenEmailChangeRevoker(
      mockOf<PasswordResetTokenRepository>({ consumeAllForUser }),
      mockOf<EmailChangeTokenRevokerRegistry>(),
    );

    await revoker.revokeAllForUser(7);

    expect(consumeAllForUser).toHaveBeenCalledWith(7);
  });
});
