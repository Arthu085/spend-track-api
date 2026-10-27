import { RoleEnum } from '@modules/authorization/domain/enums/role.enum';
import { LastActiveAdminError } from '../../../domain/errors/last-active-admin.error';
import { SelfDeactivationForbiddenError } from '../../../domain/errors/self-deactivation-forbidden.error';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import type { UserEntity } from '../../../domain/entities/user.entity';
import { UserNotFoundError } from '../../../domain/errors/user-not-found.error';
import type { UserChangeRequestRepository } from '../../../domain/repositories/user-change-request.repository';
import type { UserRepository } from '../../../domain/repositories/user.repository';
import { buildUser } from '@test/support/builders/user.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import { AdminTargetForbiddenError } from '../../../domain/errors/admin-target-forbidden.error';
import type { UserSessionRevokerRegistry } from '../../ports/user-session-revoker.port';
import { UpdateUserStatusUseCase } from '../update-user-status.use-case';

const changeRequests = mockOf<UserChangeRequestRepository>({
  supersedePendingInvolving: jest.fn().mockResolvedValue(undefined),
});

const transactionManager = {
  runInTransaction: <T>(work: () => Promise<T>): Promise<T> => work(),
  runInSavepoint: <T>(work: () => Promise<T>): Promise<T> => work(),
};

let revokeAllForUser: jest.Mock;
let sessionRevokers: UserSessionRevokerRegistry;

beforeEach(() => {
  revokeAllForUser = jest.fn().mockResolvedValue(undefined);
  sessionRevokers = { register: jest.fn(), revokeAllForUser };
});

describe('UpdateUserStatusUseCase', () => {
  it('loads the user, calls withStatus, persists the result and revokes every session on deactivation', async () => {
    const updatedUser = { uuid: 'user-1' } as UserEntity;
    const withStatus = jest.fn().mockReturnValue(updatedUser);
    const user = { id: 7, roles: [], withStatus } as unknown as UserEntity;

    const findByUuidForUpdate = jest.fn().mockResolvedValue(user);
    const update = jest.fn().mockResolvedValue(updatedUser);

    const userRepository = {
      lockAdminRoster: jest.fn(),
      countActiveAdmins: jest.fn().mockResolvedValue(2),
      findById: jest.fn().mockResolvedValue(null),
      findByUuidForUpdate,
      update,
    } as unknown as UserRepository;

    const useCase = new UpdateUserStatusUseCase(
      userRepository,
      changeRequests,
      transactionManager,
      sessionRevokers,
    );

    const result = await useCase.execute({
      uuid: 'user-1',
      status: RecordStatus.INACTIVE,
      actorId: 101,
    });

    expect(findByUuidForUpdate).toHaveBeenCalledWith('user-1');
    expect(withStatus).toHaveBeenCalledWith(RecordStatus.INACTIVE, 101);
    expect(update).toHaveBeenCalledWith(updatedUser);
    expect(revokeAllForUser).toHaveBeenCalledWith(7);
    expect(result).toBe(updatedUser);
  });

  it('stops and rejects when session revocation fails, so the deactivation rolls back with it', async () => {
    const user = {
      id: 7,
      roles: [],
      withStatus: jest.fn().mockReturnValue({ uuid: 'user-1' }),
    } as unknown as UserEntity;

    const userRepository = {
      lockAdminRoster: jest.fn(),
      countActiveAdmins: jest.fn().mockResolvedValue(2),
      findById: jest.fn().mockResolvedValue(null),
      findByUuidForUpdate: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockResolvedValue({ uuid: 'user-1' }),
    } as unknown as UserRepository;

    revokeAllForUser.mockRejectedValueOnce(new Error('boom'));

    const useCase = new UpdateUserStatusUseCase(
      userRepository,
      changeRequests,
      transactionManager,
      sessionRevokers,
    );

    await expect(
      useCase.execute({
        uuid: 'user-1',
        status: RecordStatus.INACTIVE,
        actorId: 101,
      }),
    ).rejects.toThrow('boom');
  });

  it('throws UserNotFoundError when the user does not exist', async () => {
    const findByUuidForUpdate = jest.fn().mockResolvedValue(null);

    const userRepository = {
      lockAdminRoster: jest.fn(),
      countActiveAdmins: jest.fn().mockResolvedValue(2),
      findById: jest.fn().mockResolvedValue(null),
      findByUuidForUpdate,
      update: jest.fn(),
    } as unknown as UserRepository;

    const useCase = new UpdateUserStatusUseCase(
      userRepository,
      changeRequests,
      transactionManager,
      sessionRevokers,
    );

    await expect(
      useCase.execute({
        uuid: 'missing',
        status: RecordStatus.ACTIVE,
        actorId: null,
      }),
    ).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it('regression: an INACTIVE user can be transitioned back to ACTIVE (this is the only way back)', async () => {
    const reactivatedUser = {
      uuid: 'user-1',
      status: RecordStatus.ACTIVE,
    } as UserEntity;

    const withStatus = jest.fn().mockReturnValue(reactivatedUser);

    const user = {
      status: RecordStatus.INACTIVE,
      roles: [],
      withStatus,
    } as unknown as UserEntity;

    const findByUuidForUpdate = jest.fn().mockResolvedValue(user);
    const update = jest.fn().mockResolvedValue(reactivatedUser);

    const userRepository = {
      lockAdminRoster: jest.fn(),
      countActiveAdmins: jest.fn().mockResolvedValue(2),
      findById: jest.fn().mockResolvedValue(null),
      findByUuidForUpdate,
      update,
    } as unknown as UserRepository;

    const useCase = new UpdateUserStatusUseCase(
      userRepository,
      changeRequests,
      transactionManager,
      sessionRevokers,
    );

    const result = await useCase.execute({
      uuid: 'user-1',
      status: RecordStatus.ACTIVE,
      actorId: 101,
    });

    expect(withStatus).toHaveBeenCalledWith(RecordStatus.ACTIVE, 101);
    expect(update).toHaveBeenCalledWith(reactivatedUser);
    expect(revokeAllForUser).not.toHaveBeenCalled();
    expect(result).toBe(reactivatedUser);
  });
  it('rejects self deactivation and removal of the last admin before updating', async () => {
    const user = {
      id: 101,
      status: RecordStatus.ACTIVE,
      deletedAt: null,
      roles: [
        { name: RoleEnum.ADMIN, status: RecordStatus.ACTIVE, deletedAt: null },
      ],
      withStatus: jest.fn(),
    } as unknown as UserEntity;

    const otherAdmin = buildUser({ id: 102, roles: user.roles });

    const update = jest.fn();

    const userRepository = {
      lockAdminRoster: jest.fn(),
      findByUuidForUpdate: jest.fn().mockResolvedValue(user),
      findById: jest.fn().mockResolvedValue(otherAdmin),
      countActiveAdmins: jest.fn().mockResolvedValue(1),
      update,
    } as unknown as UserRepository;

    const useCase = new UpdateUserStatusUseCase(
      userRepository,
      changeRequests,
      transactionManager,
      sessionRevokers,
    );

    await expect(
      useCase.execute({
        uuid: 'user-1',
        status: RecordStatus.INACTIVE,
        actorId: 101,
      }),
    ).rejects.toThrow(SelfDeactivationForbiddenError);
    await expect(
      useCase.execute({
        uuid: 'user-1',
        status: RecordStatus.INACTIVE,
        actorId: 102,
      }),
    ).rejects.toThrow(LastActiveAdminError);
    expect(update).not.toHaveBeenCalled();
    expect(revokeAllForUser).not.toHaveBeenCalled();
  });

  it.each([
    { scenario: 'a non-admin actor', actor: buildUser({ id: 50 }) },
    { scenario: 'no actor', actor: null },
  ])('forbids $scenario from acting on an admin', async ({ actor }) => {
    const admin = buildUser({
      id: 7,
      uuid: 'admin-1',
      roles: [
        {
          name: RoleEnum.ADMIN,
          status: RecordStatus.ACTIVE,
          deletedAt: null,
        } as UserEntity['roles'][number],
      ],
    });

    const update = jest.fn();

    const useCase = new UpdateUserStatusUseCase(
      mockOf<UserRepository>({
        lockAdminRoster: jest.fn().mockResolvedValue(undefined),
        findByUuidForUpdate: jest.fn().mockResolvedValue(admin),
        findById: jest.fn().mockResolvedValue(actor),
        countActiveAdmins: jest.fn().mockResolvedValue(2),
        update,
      }),
      changeRequests,
      transactionManager,
      sessionRevokers,
    );

    const actorId = actor?.id ?? null;

    await expect(
      useCase.execute({
        uuid: admin.uuid,
        status: RecordStatus.INACTIVE,
        actorId,
      }),
    ).rejects.toThrow(AdminTargetForbiddenError);
    expect(update).not.toHaveBeenCalled();
  });

  it('supersedes every pending change request filed by or for an admin it removes', async () => {
    const adminRole = {
      name: RoleEnum.ADMIN,
      status: RecordStatus.ACTIVE,
      deletedAt: null,
    } as UserEntity['roles'][number];

    const target = buildUser({ id: 7, uuid: 'admin-1', roles: [adminRole] });
    const actor = buildUser({ id: 8, roles: [adminRole] });
    const supersedePendingInvolving = jest.fn().mockResolvedValue(undefined);

    const useCase = new UpdateUserStatusUseCase(
      mockOf<UserRepository>({
        lockAdminRoster: jest.fn().mockResolvedValue(undefined),
        findByUuidForUpdate: jest.fn().mockResolvedValue(target),
        findById: jest.fn().mockResolvedValue(actor),
        countActiveAdmins: jest.fn().mockResolvedValue(2),
        update: jest.fn().mockResolvedValue(target),
        softDelete: jest.fn().mockResolvedValue(undefined),
      }),
      mockOf<UserChangeRequestRepository>({ supersedePendingInvolving }),
      transactionManager,
      sessionRevokers,
    );

    await useCase.execute({
      uuid: target.uuid,
      status: RecordStatus.INACTIVE,
      actorId: actor.id,
    });

    expect(supersedePendingInvolving).toHaveBeenCalledWith(7);
  });
});
