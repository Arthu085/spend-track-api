import type { UserSessionRevokerRegistry } from '@modules/users';
import type { RefreshTokenRepository } from '../../../domain/repositories/refresh-token.repository';
import { RefreshTokenSessionRevoker } from '../refresh-token-session-revoker';
import { mockOf } from '@test/support/mocks/mock-of';

describe('RefreshTokenSessionRevoker', () => {
  it('registers itself with the users session registry on module init', () => {
    const register = jest.fn();

    const revoker = new RefreshTokenSessionRevoker(
      mockOf<RefreshTokenRepository>(),
      mockOf<UserSessionRevokerRegistry>({ register }),
    );

    revoker.onModuleInit();

    expect(register).toHaveBeenCalledWith(revoker);
  });

  it('revokes every refresh token of the user', async () => {
    const revokeAllForUser = jest.fn().mockResolvedValue(undefined);

    const revoker = new RefreshTokenSessionRevoker(
      mockOf<RefreshTokenRepository>({ revokeAllForUser }),
      mockOf<UserSessionRevokerRegistry>(),
    );

    await revoker.revokeAllForUser(7);

    expect(revokeAllForUser).toHaveBeenCalledWith(7);
  });
});
