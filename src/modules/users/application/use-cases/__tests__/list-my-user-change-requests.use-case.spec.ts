import { RoleEnum } from '@modules/authorization/domain/enums/role.enum';
import type { RoleEntity } from '@modules/authorization/domain/entities/role.entity';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { buildUser } from '@test/support/builders/user.builder';
import { buildUserChangeRequest } from '@test/support/builders/user-change-request.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import type { UserEntity } from '../../../domain/entities/user.entity';
import { UserChangeRequestRecipientForbiddenError } from '../../../domain/errors/user-change-request-recipient-forbidden.error';
import { UserNotFoundError } from '../../../domain/errors/user-not-found.error';
import type { UserChangeRequestRepository } from '../../../domain/repositories/user-change-request.repository';
import type { UserRepository } from '../../../domain/repositories/user.repository';
import { ListMyUserChangeRequestsUseCase } from '../list-my-user-change-requests.use-case';

function role(name: RoleEnum): RoleEntity {
  return {
    uuid: `${name}-role`,
    name,
    status: RecordStatus.ACTIVE,
    deletedAt: null,
  } as RoleEntity;
}

function buildHarness(user: UserEntity | null) {
  const pending = [buildUserChangeRequest({ targetUserId: 7 })];
  const findPendingForUser = jest.fn().mockResolvedValue(pending);

  const useCase = new ListMyUserChangeRequestsUseCase(
    mockOf<UserRepository>({ findById: jest.fn().mockResolvedValue(user) }),
    mockOf<UserChangeRequestRepository>({ findPendingForUser }),
  );

  return { useCase, pending, findPendingForUser };
}

describe('ListMyUserChangeRequestsUseCase', () => {
  it("lists an admin's pending requests", async () => {
    const { useCase, pending, findPendingForUser } = buildHarness(
      buildUser({ id: 7, roles: [role(RoleEnum.ADMIN)] }),
    );

    await expect(useCase.execute(7)).resolves.toBe(pending);
    expect(findPendingForUser).toHaveBeenCalledWith(7, expect.any(Date));
  });

  it('refuses a user who does not hold ADMIN', async () => {
    const { useCase, findPendingForUser } = buildHarness(
      buildUser({ id: 7, roles: [role(RoleEnum.USER)] }),
    );

    await expect(useCase.execute(7)).rejects.toThrow(
      UserChangeRequestRecipientForbiddenError,
    );
    expect(findPendingForUser).not.toHaveBeenCalled();
  });

  it('refuses a missing user', async () => {
    const { useCase } = buildHarness(null);

    await expect(useCase.execute(7)).rejects.toThrow(UserNotFoundError);
  });
});
