import { RoleEnum } from '@modules/authorization/domain/enums/role.enum';
import { LastActiveAdminError } from '../../../domain/errors/last-active-admin.error';
import { SelfDeletionForbiddenError } from '../../../domain/errors/self-deletion-forbidden.error';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import type { UserEntity } from '../../../domain/entities/user.entity';
import { UserNotFoundError } from '../../../domain/errors/user-not-found.error';
import type { UserChangeRequestRepository } from '../../../domain/repositories/user-change-request.repository';
import type { UserRepository } from '../../../domain/repositories/user.repository';
import { buildUser } from '@test/support/builders/user.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import { AdminTargetForbiddenError } from '../../../domain/errors/admin-target-forbidden.error';
import type { UserSessionRevokerRegistry } from '../../ports/user-session-revoker.port';
import { DeleteUserUseCase } from '../delete-user.use-case';

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

describe('DeleteUserUseCase', () => {
  it('soft-deletes the user via markDeleted and the repository, and revokes every session', async () => {
    const deletedUser = { uuid: 'user-1' } as UserEntity;
    const markDeleted = jest.fn().mockReturnValue(deletedUser);
    const user = { id: 7, roles: [], markDeleted } as unknown as UserEntity;

    const findByUuidForUpdate = jest.fn().mockResolvedValue(user);
    const softDelete = jest.fn().mockResolvedValue(undefined);

    const userRepository = {
      lockAdminRoster: jest.fn(),
      countActiveAdmins: jest.fn().mockResolvedValue(2),
      findById: jest.fn().mockResolvedValue(null),
      findByUuidForUpdate,
      softDelete,
    } as unknown as UserRepository;

    const useCase = new DeleteUserUseCase(
      userRepository,
      changeRequests,
      transactionManager,
      sessionRevokers,
    );

    await useCase.execute({ uuid: 'user-1', actorId: 101 });

    expect(markDeleted).toHaveBeenCalledWith(101);
    expect(softDelete).toHaveBeenCalledWith(deletedUser);
    expect(revokeAllForUser).toHaveBeenCalledWith(7);
  });

  it('rejects when session revocation fails, so the deletion rolls back with it', async () => {
    const user = {
      id: 7,
      roles: [],
      markDeleted: jest.fn().mockReturnValue({ uuid: 'user-1' }),
    } as unknown as UserEntity;

    const userRepository = {
      lockAdminRoster: jest.fn(),
      countActiveAdmins: jest.fn().mockResolvedValue(2),
      findById: jest.fn().mockResolvedValue(null),
      findByUuidForUpdate: jest.fn().mockResolvedValue(user),
      softDelete: jest.fn().mockResolvedValue(undefined),
    } as unknown as UserRepository;

    revokeAllForUser.mockRejectedValueOnce(new Error('boom'));

    const useCase = new DeleteUserUseCase(
      userRepository,
      changeRequests,
      transactionManager,
      sessionRevokers,
    );

    await expect(
      useCase.execute({ uuid: 'user-1', actorId: 101 }),
    ).rejects.toThrow('boom');
  });

  it('throws UserNotFoundError when the user does not exist', async () => {
    const findByUuidForUpdate = jest.fn().mockResolvedValue(null);

    const userRepository = {
      lockAdminRoster: jest.fn(),
      countActiveAdmins: jest.fn().mockResolvedValue(2),
      findById: jest.fn().mockResolvedValue(null),
      findByUuidForUpdate,
      softDelete: jest.fn(),
    } as unknown as UserRepository;

    const useCase = new DeleteUserUseCase(
      userRepository,
      changeRequests,
      transactionManager,
      sessionRevokers,
    );

    await expect(
      useCase.execute({ uuid: 'missing', actorId: null }),
    ).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it('regression: an INACTIVE user is still deletable (DELETE is exempt from the active-record check)', async () => {
    const deletedUser = { uuid: 'user-1' } as UserEntity;
    const markDeleted = jest.fn().mockReturnValue(deletedUser);

    const user = {
      status: RecordStatus.INACTIVE,
      roles: [],
      markDeleted,
    } as unknown as UserEntity;

    const findByUuidForUpdate = jest.fn().mockResolvedValue(user);
    const softDelete = jest.fn().mockResolvedValue(undefined);

    const userRepository = {
      lockAdminRoster: jest.fn(),
      countActiveAdmins: jest.fn().mockResolvedValue(2),
      findById: jest.fn().mockResolvedValue(null),
      findByUuidForUpdate,
      softDelete,
    } as unknown as UserRepository;

    const useCase = new DeleteUserUseCase(
      userRepository,
      changeRequests,
      transactionManager,
      sessionRevokers,
    );

    await expect(
      useCase.execute({ uuid: 'user-1', actorId: 101 }),
    ).resolves.toBeUndefined();

    expect(markDeleted).toHaveBeenCalledWith(101);
    expect(softDelete).toHaveBeenCalledWith(deletedUser);
  });
  it('rejects self deletion and deletion of the last admin before persisting', async () => {
    const user = {
      id: 101,
      status: RecordStatus.ACTIVE,
      deletedAt: null,
      roles: [
        { name: RoleEnum.ADMIN, status: RecordStatus.ACTIVE, deletedAt: null },
      ],
      markDeleted: jest.fn(),
    } as unknown as UserEntity;

    const otherAdmin = buildUser({ id: 102, roles: user.roles });

    const softDelete = jest.fn();

    const userRepository = {
      lockAdminRoster: jest.fn(),
      findByUuidForUpdate: jest.fn().mockResolvedValue(user),
      findById: jest.fn().mockResolvedValue(otherAdmin),
      countActiveAdmins: jest.fn().mockResolvedValue(1),
      softDelete,
    } as unknown as UserRepository;

    const useCase = new DeleteUserUseCase(
      userRepository,
      changeRequests,
      transactionManager,
      sessionRevokers,
    );

    await expect(
      useCase.execute({ uuid: 'user-1', actorId: 101 }),
    ).rejects.toThrow(SelfDeletionForbiddenError);
    await expect(
      useCase.execute({ uuid: 'user-1', actorId: 102 }),
    ).rejects.toThrow(LastActiveAdminError);
    expect(softDelete).not.toHaveBeenCalled();
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

    const softDelete = jest.fn();

    const useCase = new DeleteUserUseCase(
      mockOf<UserRepository>({
        lockAdminRoster: jest.fn().mockResolvedValue(undefined),
        findByUuidForUpdate: jest.fn().mockResolvedValue(admin),
        findById: jest.fn().mockResolvedValue(actor),
        countActiveAdmins: jest.fn().mockResolvedValue(2),
        softDelete,
      }),
      changeRequests,
      transactionManager,
      sessionRevokers,
    );

    const actorId = actor?.id ?? null;

    await expect(
      useCase.execute({ uuid: admin.uuid, actorId }),
    ).rejects.toThrow(AdminTargetForbiddenError);
    expect(softDelete).not.toHaveBeenCalled();
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

    const useCase = new DeleteUserUseCase(
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

    await useCase.execute({ uuid: target.uuid, actorId: actor.id });

    expect(supersedePendingInvolving).toHaveBeenCalledWith(7);
  });
});
