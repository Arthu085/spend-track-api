import { ForbiddenError } from '@shared/domain/errors';
import { AdminRoleAbilitiesImmutableError } from '../admin-role-abilities-immutable.error';

describe('AdminRoleAbilitiesImmutableError', () => {
  it('is a ForbiddenError with the authorization-specific message key', () => {
    const error = new AdminRoleAbilitiesImmutableError();

    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error.messageKey).toBe(
      'authorization.errors.admin_role_abilities_immutable',
    );
  });
});
