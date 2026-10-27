import 'reflect-metadata';
import type { Response } from 'express';
import type { AppConfigService } from '@core/config';
import type { Translate } from '@shared/presentation/decorators';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { PaginatedResult } from '@shared/application/dto';
import type { AuthenticatedUser } from '@shared/presentation/http';
import { Action } from '@shared/domain/enums/action.enum';
import { Subject } from '@shared/domain/authorization/subject';
import { DECORATORS } from '@nestjs/swagger';
import {
  ABILITY_METADATA_KEY,
  AUDIT_METADATA_KEY,
  SUCCESS_MESSAGE_METADATA_KEY,
} from '@shared/presentation/metadata';
import type { AbilityPair } from '@shared/domain/authorization/ability-pair.type';
import { UserListResponseDto } from '../../dto/output/user-list.response';
import { UserDetailResponseDto } from '../../dto/output/user-detail.response';
import type { CreateUserUseCase } from '../../../application/use-cases/create-user.use-case';
import type { DeleteUserUseCase } from '../../../application/use-cases/delete-user.use-case';
import type { GetUserUseCase } from '../../../application/use-cases/get-user.use-case';
import type { ListUsersUseCase } from '../../../application/use-cases/list-users.use-case';
import type { UpdateUserStatusUseCase } from '../../../application/use-cases/update-user-status.use-case';
import type { UpdateUserUseCase } from '../../../application/use-cases/update-user.use-case';
import { ListUsersQueryDto } from '../../dto/input/list-users-query.dto';
import { UsersManagementController } from '../users-management.controller';
import { buildUser } from '@test/support/builders/user.builder';

// Untyped record avoids @typescript-eslint/unbound-method when reading handler
// references for Reflect.getMetadata.
const controllerHandlers =
  UsersManagementController.prototype as unknown as Record<string, object>;

const createHandler = controllerHandlers.create;
const updateHandler = controllerHandlers.update;
const updateStatusHandler = controllerHandlers.updateStatus;
const removeHandler = controllerHandlers.remove;
const findAllHandler = controllerHandlers.findAll;
const findOneHandler = controllerHandlers.findOne;

function buildController(
  overrides: Partial<{
    createUser: Partial<CreateUserUseCase>;
    listUsers: Partial<ListUsersUseCase>;
    getUser: Partial<GetUserUseCase>;
    updateUser: Partial<UpdateUserUseCase>;
    updateUserStatus: Partial<UpdateUserStatusUseCase>;
    deleteUser: Partial<DeleteUserUseCase>;
  }>,
): UsersManagementController {
  return new UsersManagementController(
    (overrides.createUser ?? {}) as CreateUserUseCase,
    (overrides.listUsers ?? {}) as ListUsersUseCase,
    (overrides.getUser ?? {}) as GetUserUseCase,
    (overrides.updateUser ?? {}) as UpdateUserUseCase,
    (overrides.updateUserStatus ?? {}) as UpdateUserStatusUseCase,
    (overrides.deleteUser ?? {}) as DeleteUserUseCase,
    {
      cookie: {
        secret: 'cookie-secret',
        domain: '',
        secure: true,
        sameSite: 'lax',
      },
    } as unknown as AppConfigService,
  );
}

function buildResponse(): { res: Response; clearCookie: jest.Mock } {
  const clearCookie = jest.fn();

  return { res: { clearCookie } as unknown as Response, clearCookie };
}

const translate: Translate = (key) => key;

function buildActor(
  overrides: Partial<AuthenticatedUser> = {},
): AuthenticatedUser {
  return {
    id: 101,
    uuid: 'actor-1',
    email: 'actor@example.com',
    name: 'Actor',
    roles: [],
    ...overrides,
  };
}

describe('UsersManagementController', () => {
  it('create forwards the DTO and current actor id, and never leaks the password', async () => {
    const execute = jest.fn().mockResolvedValue(buildUser());
    const controller = buildController({ createUser: { execute } });

    const actor = buildActor();

    const result = await controller.create(
      {
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'plain-password',
        roleUuids: ['role-1'],
      },
      actor,
      translate,
    );

    expect(execute).toHaveBeenCalledWith({
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'plain-password',
      roleUuids: ['role-1'],
      actorId: 101,
    });
    expect(result).not.toHaveProperty('password');
    expect(result.uuid).toBe('user-uuid');
    expect(result).toBeInstanceOf(UserDetailResponseDto);
  });

  it('findAll returns a PaginatedResult of mapped users as UserListResponseDto instances', async () => {
    const execute = jest
      .fn()
      .mockResolvedValue(PaginatedResult.of([buildUser()], 1, 1, 20));

    const controller = buildController({ listUsers: { execute } });

    const query = new ListUsersQueryDto();
    const result = await controller.findAll(query, translate);

    expect(execute).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      name: undefined,
      email: undefined,
      role: undefined,
      status: undefined,
    });
    expect(result).toBeInstanceOf(PaginatedResult);
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.items[0]).toBeInstanceOf(UserListResponseDto);
    expect(result.items[0]).not.toBeInstanceOf(UserDetailResponseDto);
  });

  it('findAll maps the query DTO into a plain application input', async () => {
    const execute = jest
      .fn()
      .mockResolvedValue(PaginatedResult.of([], 0, 1, 20));

    const controller = buildController({ listUsers: { execute } });

    const query = new ListUsersQueryDto();
    query.name = 'ali';

    await controller.findAll(query, translate);

    const [input] = execute.mock.calls[0] as [unknown];

    expect(input).not.toBeInstanceOf(ListUsersQueryDto);
    expect(input).toEqual(expect.objectContaining({ name: 'ali' }));
  });

  it('findAll maps pagination and all four filters into the use-case input', async () => {
    const execute = jest
      .fn()
      .mockResolvedValue(PaginatedResult.of([buildUser()], 1, 1, 20));

    const controller = buildController({ listUsers: { execute } });

    const query = new ListUsersQueryDto();
    query.page = 2;
    query.limit = 10;
    query.name = 'ali';
    query.email = 'ali@example.com';
    query.role = 'role-uuid';
    query.status = RecordStatus.ACTIVE;

    const result = await controller.findAll(query, translate);

    expect(execute).toHaveBeenCalledWith({
      page: 2,
      limit: 10,
      name: 'ali',
      email: 'ali@example.com',
      role: 'role-uuid',
      status: RecordStatus.ACTIVE,
    });
    expect(result).toBeInstanceOf(PaginatedResult);
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('findOne returns the mapped user', async () => {
    const execute = jest.fn().mockResolvedValue(buildUser());
    const controller = buildController({ getUser: { execute } });

    const result = await controller.findOne('user-uuid', translate);

    expect(execute).toHaveBeenCalledWith('user-uuid');
    expect(result.uuid).toBe('user-uuid');
    expect(result).toBeInstanceOf(UserDetailResponseDto);
  });

  it('update forwards the uuid, DTO and current actor id, and keeps the session when editing another user', async () => {
    const execute = jest.fn().mockResolvedValue(buildUser());
    const controller = buildController({ updateUser: { execute } });
    const { res, clearCookie } = buildResponse();

    const actor = buildActor();

    const result = await controller.update(
      'user-uuid',
      { name: 'Jane Updated', email: 'jane@example.com', roleUuids: [] },
      actor,
      translate,
      res,
    );

    expect(execute).toHaveBeenCalledWith({
      uuid: 'user-uuid',
      name: 'Jane Updated',
      email: 'jane@example.com',
      roleUuids: [],
      actorId: 101,
    });
    expect(result.uuid).toBe('user-uuid');
    expect(result).toBeInstanceOf(UserDetailResponseDto);
    expect(clearCookie).not.toHaveBeenCalled();
  });

  it('update clears the auth cookies when the actor updates their own profile', async () => {
    const execute = jest.fn().mockResolvedValue(buildUser({ id: 101 }));
    const controller = buildController({ updateUser: { execute } });
    const { res, clearCookie } = buildResponse();

    await controller.update(
      'actor-1',
      { name: 'Actor Renamed' },
      buildActor(),
      translate,
      res,
    );

    expect(clearCookie).toHaveBeenCalledWith(
      'access_token',
      expect.objectContaining({ path: '/api' }),
    );
    expect(clearCookie).toHaveBeenCalledWith(
      'refresh_token',
      expect.objectContaining({ path: '/api/auth/refresh' }),
    );
  });

  it('updateStatus forwards the uuid, status and current actor id', async () => {
    const execute = jest.fn().mockResolvedValue(buildUser());
    const controller = buildController({ updateUserStatus: { execute } });

    const actor = buildActor();

    const result = await controller.updateStatus(
      'user-uuid',
      { status: RecordStatus.INACTIVE },
      actor,
      translate,
    );

    expect(execute).toHaveBeenCalledWith({
      uuid: 'user-uuid',
      status: RecordStatus.INACTIVE,
      actorId: 101,
    });
    expect(result.uuid).toBe('user-uuid');
    expect(result).toBeInstanceOf(UserDetailResponseDto);
  });

  it('remove forwards the uuid and current actor id and returns nothing', async () => {
    const execute = jest.fn().mockResolvedValue(undefined);
    const controller = buildController({ deleteUser: { execute } });

    const actor = buildActor({ uuid: 'actor-42', id: 42 });

    await expect(
      controller.remove('user-uuid', actor),
    ).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledWith({ uuid: 'user-uuid', actorId: 42 });
  });

  describe('GET (list/read) endpoint() route metadata', () => {
    it('requires only READ on the User subject for findAll', () => {
      const abilities = Reflect.getMetadata(
        ABILITY_METADATA_KEY,
        findAllHandler,
      ) as AbilityPair[];

      expect(abilities).toEqual([
        { action: Action.READ, subject: Subject.USER },
      ]);
    });

    it('requires only READ on the User subject for findOne', () => {
      const abilities = Reflect.getMetadata(
        ABILITY_METADATA_KEY,
        findOneHandler,
      ) as AbilityPair[];

      expect(abilities).toEqual([
        { action: Action.READ, subject: Subject.USER },
      ]);
    });

    it('audits findAll as User.list', () => {
      expect(Reflect.getMetadata(AUDIT_METADATA_KEY, findAllHandler)).toBe(
        'User.list',
      );
    });

    it('audits findOne as User.read', () => {
      expect(Reflect.getMetadata(AUDIT_METADATA_KEY, findOneHandler)).toBe(
        'User.read',
      );
    });

    it('sets the success.ok i18n key on findAll', () => {
      expect(
        Reflect.getMetadata(SUCCESS_MESSAGE_METADATA_KEY, findAllHandler),
      ).toBe('success.ok');
    });

    it('sets the success.ok i18n key on findOne', () => {
      expect(
        Reflect.getMetadata(SUCCESS_MESSAGE_METADATA_KEY, findOneHandler),
      ).toBe('success.ok');
    });
  });

  describe('POST endpoint() route metadata', () => {
    it('requires only CREATE on the User subject (not paired with READ)', () => {
      const abilities = Reflect.getMetadata(
        ABILITY_METADATA_KEY,
        createHandler,
      ) as AbilityPair[];

      expect(abilities).toEqual([
        { action: Action.CREATE, subject: Subject.USER },
      ]);
    });
  });

  describe('PATCH :uuid endpoint() route metadata', () => {
    it('requires UPDATE and READ on the User subject', () => {
      const abilities = Reflect.getMetadata(
        ABILITY_METADATA_KEY,
        updateHandler,
      ) as AbilityPair[];

      expect(abilities).toEqual([
        { action: Action.UPDATE, subject: Subject.USER },
        { action: Action.READ, subject: Subject.USER },
      ]);
    });
  });

  describe('DELETE :uuid endpoint() route metadata', () => {
    it('requires DELETE and READ on the User subject', () => {
      const abilities = Reflect.getMetadata(
        ABILITY_METADATA_KEY,
        removeHandler,
      ) as AbilityPair[];

      expect(abilities).toEqual([
        { action: Action.DELETE, subject: Subject.USER },
        { action: Action.READ, subject: Subject.USER },
      ]);
    });
  });

  describe('PUT :uuid/status endpoint() route metadata', () => {
    it('requires UPDATE and READ on the User subject', () => {
      const abilities = Reflect.getMetadata(
        ABILITY_METADATA_KEY,
        updateStatusHandler,
      ) as AbilityPair[];

      expect(abilities).toEqual([
        { action: Action.UPDATE, subject: Subject.USER },
        { action: Action.READ, subject: Subject.USER },
      ]);
    });

    it('audits as User.update_status', () => {
      expect(Reflect.getMetadata(AUDIT_METADATA_KEY, updateStatusHandler)).toBe(
        'User.update_status',
      );
    });

    it('sets the success.updated i18n key', () => {
      expect(
        Reflect.getMetadata(SUCCESS_MESSAGE_METADATA_KEY, updateStatusHandler),
      ).toBe('success.updated');
    });

    it('documents the route under the "users" Swagger tag', () => {
      const tags = Reflect.getMetadata(
        DECORATORS.API_TAGS,
        updateStatusHandler,
      ) as string[];

      expect(tags).toContain('users');
    });
  });
});
