import { RoleEnum } from '@modules/authorization/domain/enums/role.enum';
import type { RoleEntity } from '@modules/authorization/domain/entities/role.entity';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { buildUser } from '@test/support/builders/user.builder';
import { buildUserChangeRequest } from '@test/support/builders/user-change-request.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import type { UserChangeRequestEntity } from '../../../domain/entities/user-change-request.entity';
import { UserChangeRequestStatus } from '../../../domain/enums/user-change-request-status.enum';
import { UserChangeRequestNotFoundError } from '../../../domain/errors/user-change-request-not-found.error';
import { UserChangeRequestNotPendingError } from '../../../domain/errors/user-change-request-not-pending.error';
import { UserChangeRequestRecipientForbiddenError } from '../../../domain/errors/user-change-request-recipient-forbidden.error';
import type { UserChangeRequestRepository } from '../../../domain/repositories/user-change-request.repository';
import type { UserRepository } from '../../../domain/repositories/user.repository';
import { RejectUserChangeRequestUseCase } from '../reject-user-change-request.use-case';

const transactionManager = {
  runInTransaction: <T>(work: () => Promise<T>): Promise<T> => work(),
  runInSavepoint: <T>(work: () => Promise<T>): Promise<T> => work(),
};

function role(name: RoleEnum): RoleEntity {
  return {
    uuid: `${name}-role`,
    name,
    status: RecordStatus.ACTIVE,
    deletedAt: null,
  } as RoleEntity;
}

function buildHarness(
  request: UserChangeRequestEntity | null,
  roles = [role(RoleEnum.ADMIN)],
) {
  const findByIdForUpdate = jest
    .fn()
    .mockResolvedValue(buildUser({ id: 7, roles }));

  const saveDecision = jest
    .fn<Promise<void>, [UserChangeRequestEntity]>()
    .mockResolvedValue(undefined);

  const useCase = new RejectUserChangeRequestUseCase(
    mockOf<UserRepository>({ findByIdForUpdate }),
    mockOf<UserChangeRequestRepository>({
      findByUuid: jest.fn().mockResolvedValue(request),
      saveDecision,
    }),
    transactionManager,
  );

  return { useCase, findByIdForUpdate, saveDecision };
}

const reject = { uuid: 'change-request-uuid', actorId: 7 };

describe('RejectUserChangeRequestUseCase', () => {
  it('locks the user row and records the rejection', async () => {
    const { useCase, findByIdForUpdate, saveDecision } = buildHarness(
      buildUserChangeRequest({ targetUserId: 7 }),
    );

    await useCase.execute(reject);

    expect(findByIdForUpdate).toHaveBeenCalledWith(7);
    const [decided] = saveDecision.mock.calls[0];
    expect(decided.status).toBe(UserChangeRequestStatus.REJECTED);
  });

  it("returns 404 for another user's request", async () => {
    const { useCase, saveDecision } = buildHarness(
      buildUserChangeRequest({ targetUserId: 8 }),
    );

    await expect(useCase.execute(reject)).rejects.toThrow(
      UserChangeRequestNotFoundError,
    );
    expect(saveDecision).not.toHaveBeenCalled();
  });

  it('refuses a user who does not hold ADMIN', async () => {
    const { useCase, saveDecision } = buildHarness(
      buildUserChangeRequest({ targetUserId: 7 }),
      [role(RoleEnum.USER)],
    );

    await expect(useCase.execute(reject)).rejects.toThrow(
      UserChangeRequestRecipientForbiddenError,
    );
    expect(saveDecision).not.toHaveBeenCalled();
  });

  it('refuses a request that is no longer pending', async () => {
    const { useCase, saveDecision } = buildHarness(
      buildUserChangeRequest({
        targetUserId: 7,
        status: UserChangeRequestStatus.SUPERSEDED,
      }),
    );

    await expect(useCase.execute(reject)).rejects.toThrow(
      UserChangeRequestNotPendingError,
    );
    expect(saveDecision).not.toHaveBeenCalled();
  });
});
