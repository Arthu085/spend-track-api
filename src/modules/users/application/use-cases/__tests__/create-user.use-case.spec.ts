import { RoleEnum } from '@modules/authorization/domain/enums/role.enum';
import { AdminRoleGrantForbiddenError } from '../../../domain/errors/admin-role-grant-forbidden.error';
import { Logger } from '@nestjs/common';
import type { RoleEntity } from '@modules/authorization/domain/entities/role.entity';
import type { RoleRepository } from '@modules/authorization/domain/repositories/role.repository';
import { InactiveRoleError } from '@modules/authorization/domain/errors/inactive-role.error';
import { RoleNotFoundError } from '@modules/authorization/domain/errors/role-not-found.error';
import { EmailType } from '@shared/domain/enums/email-type.enum';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import {
  EmailSchedulingUnavailableError,
  type EmailOutboxPort,
} from '@shared/application/ports';
import { EmailAlreadyInUseError } from '../../../domain/errors/email-already-in-use.error';
import type { UserEntity } from '../../../domain/entities/user.entity';
import type { UserRepository } from '../../../domain/repositories/user.repository';
import type { PasswordHasher } from '../../ports/password-hasher.port';
import { CreateUserUseCase } from '../create-user.use-case';

function buildEmailOutbox(overrides: Partial<{ schedule: jest.Mock }> = {}): {
  port: EmailOutboxPort;
  schedule: jest.Mock;
} {
  const schedule =
    overrides.schedule ??
    jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          insideTransaction ? { scheduled: true } : { scheduled: false },
        ),
      );

  return { port: { schedule }, schedule };
}

function buildRole(
  uuid: string,
  name: RoleEnum = RoleEnum.USER,
  status: RecordStatus = RecordStatus.ACTIVE,
): RoleEntity {
  return { uuid, name, status, deletedAt: null } as RoleEntity;
}

// Records whether the work is running "inside" the transaction, so tests can
// assert the confirmation is scheduled as part of the user's unit of work.
let insideTransaction = false;

const transactionManager = {
  runInTransaction: async <T>(work: () => Promise<T>): Promise<T> => {
    insideTransaction = true;

    try {
      return await work();
    } finally {
      insideTransaction = false;
    }
  },
  runInSavepoint: <T>(work: () => Promise<T>): Promise<T> => work(),
};

describe('CreateUserUseCase', () => {
  const input = {
    name: 'Jane Doe',
    email: 'jane@example.com',
    password: 'plain-password',
    roleUuids: ['role-uuid'],
    actorId: 101,
  };

  it('hashes the password, resolves roles, creates the user, and issues an email-confirmation token when the email is free', async () => {
    const findByEmail = jest.fn().mockResolvedValue(null);

    const createdUser = {
      uuid: 'user-uuid',
      email: 'jane@example.com',
    } as UserEntity;

    const create = jest.fn().mockResolvedValue(createdUser);

    const userRepository = {
      lockAdminRoster: jest.fn(),
      countActiveAdmins: jest.fn().mockResolvedValue(2),
      findById: jest.fn().mockResolvedValue(null),
      findByEmail,
      create,
    } as unknown as UserRepository;

    const roles = [buildRole('role-uuid')];
    const findByUuids = jest.fn().mockResolvedValue(roles);
    const roleRepository = { findByUuids } as unknown as RoleRepository;

    const hash = jest.fn().mockResolvedValue('hashed-password');
    const passwordHasher = { hash } as unknown as PasswordHasher;

    const { port: emailOutbox, schedule } = buildEmailOutbox();

    const useCase = new CreateUserUseCase(
      userRepository,
      roleRepository,
      passwordHasher,
      emailOutbox,
      transactionManager,
    );

    const result = await useCase.execute(input);

    expect(findByEmail).toHaveBeenCalledWith('jane@example.com');
    expect(findByUuids).toHaveBeenCalledWith(['role-uuid']);
    expect(hash).toHaveBeenCalledWith('plain-password');
    expect(create).toHaveBeenCalledTimes(1);

    const [createdEntity] = create.mock.calls[0] as [UserEntity];

    expect(createdEntity.name).toBe('Jane Doe');
    expect(createdEntity.email).toBe('jane@example.com');
    expect(createdEntity.password).toBe('hashed-password');
    expect(createdEntity.roles).toBe(roles);

    expect(schedule).toHaveBeenCalledWith({
      emailType: EmailType.EMAIL_CONFIRMATION,
      recipient: createdUser.email,
    });
    expect(schedule.mock.invocationCallOrder[0]).toBeGreaterThan(
      create.mock.invocationCallOrder[0],
    );
    await expect(
      schedule.mock.results[0].value as Promise<unknown>,
    ).resolves.toEqual({ scheduled: true });
    expect(result).toBe(createdUser);
  });

  it('normalizes a mixed-case email before the uniqueness check and persistence', async () => {
    const findByEmail = jest.fn().mockResolvedValue(null);

    const create = jest
      .fn()
      .mockImplementation((user: UserEntity) => Promise.resolve(user));

    const userRepository = {
      lockAdminRoster: jest.fn(),
      countActiveAdmins: jest.fn().mockResolvedValue(2),
      findById: jest.fn().mockResolvedValue(null),
      findByEmail,
      create,
    } as unknown as UserRepository;

    const roleRepository = {
      findByUuids: jest.fn().mockResolvedValue([buildRole('role-uuid')]),
    } as unknown as RoleRepository;

    const passwordHasher = {
      hash: jest.fn().mockResolvedValue('hashed-password'),
    } as unknown as PasswordHasher;

    const { port: emailOutbox, schedule } = buildEmailOutbox();

    const useCase = new CreateUserUseCase(
      userRepository,
      roleRepository,
      passwordHasher,
      emailOutbox,
      transactionManager,
    );

    const result = await useCase.execute({
      ...input,
      email: '  Jane@Example.COM ',
    });

    expect(findByEmail).toHaveBeenCalledWith('jane@example.com');
    expect(result.email).toBe('jane@example.com');
    expect(schedule).toHaveBeenCalledWith({
      emailType: EmailType.EMAIL_CONFIRMATION,
      recipient: 'jane@example.com',
    });
  });

  it('throws EmailAlreadyInUseError when the email is already taken, without scheduling a confirmation', async () => {
    const findByEmail = jest.fn().mockResolvedValue({ uuid: 'existing-user' });

    const userRepository = {
      lockAdminRoster: jest.fn(),
      countActiveAdmins: jest.fn().mockResolvedValue(2),
      findById: jest.fn().mockResolvedValue(null),
      findByEmail,
      create: jest.fn(),
    } as unknown as UserRepository;

    const findByUuids = jest.fn();
    const roleRepository = { findByUuids } as unknown as RoleRepository;

    const passwordHasher = { hash: jest.fn() } as unknown as PasswordHasher;

    const { port: emailOutbox, schedule } = buildEmailOutbox();

    const useCase = new CreateUserUseCase(
      userRepository,
      roleRepository,
      passwordHasher,
      emailOutbox,
      transactionManager,
    );

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(
      EmailAlreadyInUseError,
    );
    expect(findByUuids).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  function buildDeniedScheduleUseCase(schedule: jest.Mock): {
    useCase: CreateUserUseCase;
    createdUser: UserEntity;
  } {
    const createdUser = {
      uuid: 'user-uuid',
      email: 'jane@example.com',
    } as UserEntity;

    const userRepository = {
      lockAdminRoster: jest.fn(),
      countActiveAdmins: jest.fn().mockResolvedValue(2),
      findById: jest.fn().mockResolvedValue(null),
      findByEmail: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(createdUser),
    } as unknown as UserRepository;

    const roleRepository = {
      findByUuids: jest.fn().mockResolvedValue([buildRole('role-uuid')]),
    } as unknown as RoleRepository;

    const passwordHasher = {
      hash: jest.fn().mockResolvedValue('hashed-password'),
    } as unknown as PasswordHasher;

    const useCase = new CreateUserUseCase(
      userRepository,
      roleRepository,
      passwordHasher,
      buildEmailOutbox({ schedule }).port,
      transactionManager,
    );

    return { useCase, createdUser };
  }

  it.each(['EXHAUSTED', 'DISABLED'])(
    'when the send quota denies the confirmation (%s), still creates and returns the user and logs a warning with the reason',
    async (reason) => {
      const { useCase, createdUser } = buildDeniedScheduleUseCase(
        jest.fn().mockResolvedValue({ scheduled: false, reason }),
      );

      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

      const result = await useCase.execute(input);

      expect(result).toBe(createdUser);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith({
        msg: 'Email confirmation not scheduled',
        userId: createdUser.uuid,
        reason,
      });

      warnSpy.mockRestore();
    },
  );

  it('throws from inside the transaction when scheduling is unavailable, so the user creation rolls back', async () => {
    let thrownInsideTransaction = false;

    const { useCase } = buildDeniedScheduleUseCase(
      jest.fn().mockResolvedValue({ scheduled: false, reason: 'UNAVAILABLE' }),
    );

    const runInTransaction = transactionManager.runInTransaction;

    jest
      .spyOn(transactionManager, 'runInTransaction')
      .mockImplementationOnce(async (work) => {
        try {
          return await runInTransaction(work);
        } catch (error) {
          thrownInsideTransaction = true;
          throw error;
        }
      });

    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(
      EmailSchedulingUnavailableError,
    );
    expect(thrownInsideTransaction).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('propagates a user persistence failure without scheduling a confirmation', async () => {
    const userRepository = {
      lockAdminRoster: jest.fn(),
      findById: jest.fn().mockResolvedValue(null),
      findByEmail: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockRejectedValue(new Error('boom')),
    } as unknown as UserRepository;

    const roleRepository = {
      findByUuids: jest.fn().mockResolvedValue([buildRole('role-uuid')]),
    } as unknown as RoleRepository;

    const { port: emailOutbox, schedule } = buildEmailOutbox();

    const useCase = new CreateUserUseCase(
      userRepository,
      roleRepository,
      {
        hash: jest.fn().mockResolvedValue('hashed-password'),
      } as unknown as PasswordHasher,
      emailOutbox,
      transactionManager,
    );

    await expect(useCase.execute(input)).rejects.toThrow('boom');
    expect(schedule).not.toHaveBeenCalled();
  });

  it('rejects a non-admin actor assigning ADMIN before hashing or persisting', async () => {
    const create = jest.fn();
    const hash = jest.fn();

    const userRepository = {
      lockAdminRoster: jest.fn(),
      findByEmail: jest.fn().mockResolvedValue(null),
      findById: jest.fn().mockResolvedValue({
        status: 'ACTIVE',
        deletedAt: null,
        roles: [{ name: RoleEnum.USER }],
      }),
      create,
    } as unknown as UserRepository;

    const roleRepository = {
      findByUuids: jest
        .fn()
        .mockResolvedValue([buildRole('role-uuid', RoleEnum.ADMIN)]),
    } as unknown as RoleRepository;

    const useCase = new CreateUserUseCase(
      userRepository,
      roleRepository,
      { hash } as unknown as PasswordHasher,
      buildEmailOutbox().port,
      transactionManager,
    );

    await expect(useCase.execute(input)).rejects.toThrow(
      AdminRoleGrantForbiddenError,
    );
    expect(hash).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    {
      scenario: 'a requested role does not exist',
      resolved: [buildRole('role-uuid')],
      roleUuids: ['role-uuid', 'missing-role-uuid'],
      error: RoleNotFoundError,
    },
    {
      scenario: 'a requested role is inactive',
      resolved: [buildRole('role-uuid', RoleEnum.USER, RecordStatus.INACTIVE)],
      roleUuids: ['role-uuid'],
      error: InactiveRoleError,
    },
  ])(
    'throws $error.name when $scenario, before hashing or persisting',
    async ({ resolved, roleUuids, error }) => {
      const create = jest.fn();
      const hash = jest.fn();

      const userRepository = {
        lockAdminRoster: jest.fn(),
        findByEmail: jest.fn().mockResolvedValue(null),
        findById: jest.fn().mockResolvedValue(null),
        create,
      } as unknown as UserRepository;

      const roleRepository = {
        findByUuids: jest.fn().mockResolvedValue(resolved),
      } as unknown as RoleRepository;

      const { port: emailOutbox, schedule } = buildEmailOutbox();

      const useCase = new CreateUserUseCase(
        userRepository,
        roleRepository,
        { hash } as unknown as PasswordHasher,
        emailOutbox,
        transactionManager,
      );

      await expect(useCase.execute({ ...input, roleUuids })).rejects.toThrow(
        error,
      );
      expect(hash).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
      expect(schedule).not.toHaveBeenCalled();
    },
  );

  it('checks role resolution before the ADMIN grant rule', async () => {
    const userRepository = {
      lockAdminRoster: jest.fn(),
      findByEmail: jest.fn().mockResolvedValue(null),
      findById: jest.fn().mockResolvedValue({
        status: RecordStatus.ACTIVE,
        deletedAt: null,
        roles: [{ name: RoleEnum.USER }],
      }),
      create: jest.fn(),
    } as unknown as UserRepository;

    const roleRepository = {
      findByUuids: jest
        .fn()
        .mockResolvedValue([buildRole('admin-role', RoleEnum.ADMIN)]),
    } as unknown as RoleRepository;

    const useCase = new CreateUserUseCase(
      userRepository,
      roleRepository,
      { hash: jest.fn() } as unknown as PasswordHasher,
      buildEmailOutbox().port,
      transactionManager,
    );

    await expect(
      useCase.execute({ ...input, roleUuids: ['admin-role', 'missing-role'] }),
    ).rejects.toThrow(RoleNotFoundError);
  });
});
