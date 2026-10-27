import 'reflect-metadata';
import type { Response } from 'express';
import type { AppConfigService } from '@core/config';
import type { Translate } from '@shared/presentation/decorators';
import { PATH_METADATA } from '@nestjs/common/constants';
import { DECORATORS } from '@nestjs/swagger';
import type { AuthenticatedUser } from '@shared/presentation/http';
import {
  ABILITY_METADATA_KEY,
  AUDIT_METADATA_KEY,
  SUCCESS_MESSAGE_METADATA_KEY,
} from '@shared/presentation/metadata';
import { PUBLIC_AUTH_FLOW_THROTTLE_METADATA_KEY } from '@shared/presentation/throttling';
import { Subject } from '@shared/domain/authorization/subject';
import { Action } from '@shared/domain/enums/action.enum';
import { AbilityPairResponseDto } from '../../dto/output/ability-pair.response';
import { UserDetailResponseDto } from '../../dto/output/user-detail.response';
import type { ChangeOwnPasswordUseCase } from '../../../application/use-cases/change-own-password.use-case';
import type { GetUserUseCase } from '../../../application/use-cases/get-user.use-case';
import type { ListOwnAbilitiesUseCase } from '../../../application/use-cases/list-own-abilities.use-case';
import type { UpdateOwnProfileUseCase } from '../../../application/use-cases/update-own-profile.use-case';
import { UsersProfileController } from '../users-profile.controller';
import { buildUser } from '@test/support/builders/user.builder';

// Untyped record avoids @typescript-eslint/unbound-method when reading handler
// references for Reflect.getMetadata.
const controllerHandlers =
  UsersProfileController.prototype as unknown as Record<string, object>;

const updateMeHandler = controllerHandlers.updateMe;
const findMeHandler = controllerHandlers.findMe;
const findMyAbilitiesHandler = controllerHandlers.findMyAbilities;
const changeMyPasswordHandler = controllerHandlers.changeMyPassword;

function buildController(
  overrides: Partial<{
    getUser: Partial<GetUserUseCase>;
    listOwnAbilities: Partial<ListOwnAbilitiesUseCase>;
    updateOwnProfile: Partial<UpdateOwnProfileUseCase>;
    changeOwnPassword: Partial<ChangeOwnPasswordUseCase>;
  }>,
): UsersProfileController {
  return new UsersProfileController(
    (overrides.getUser ?? {}) as GetUserUseCase,
    (overrides.listOwnAbilities ?? {}) as ListOwnAbilitiesUseCase,
    (overrides.updateOwnProfile ?? {}) as UpdateOwnProfileUseCase,
    (overrides.changeOwnPassword ?? {}) as ChangeOwnPasswordUseCase,
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

describe('UsersProfileController', () => {
  it('findMe forwards the current actor uuid and never leaks the password', async () => {
    const execute = jest.fn().mockResolvedValue(buildUser());
    const controller = buildController({ getUser: { execute } });

    const actor = buildActor();

    const result = await controller.findMe(actor, translate);

    expect(execute).toHaveBeenCalledWith('actor-1');
    expect(result.uuid).toBe('user-uuid');
    expect(result).not.toHaveProperty('password');
    expect(result).toBeInstanceOf(UserDetailResponseDto);
  });

  it('findMyAbilities forwards the current actor uuid and returns only action and subject per pair', async () => {
    const execute = jest
      .fn()
      .mockResolvedValue([{ action: Action.READ, subject: Subject.USER }]);

    const controller = buildController({ listOwnAbilities: { execute } });

    const result = await controller.findMyAbilities(buildActor());

    expect(execute).toHaveBeenCalledWith('actor-1');
    expect(result).toEqual([{ action: Action.READ, subject: Subject.USER }]);
    expect(result[0]).toBeInstanceOf(AbilityPairResponseDto);
  });

  it('updateMe forwards only name, email, current password and the actor id, clears the auth cookies, and returns the updated user', async () => {
    const execute = jest.fn().mockResolvedValue(buildUser({ id: 101 }));
    const controller = buildController({ updateOwnProfile: { execute } });
    const { res, clearCookie } = buildResponse();

    const result = await controller.updateMe(
      {
        name: 'Actor Renamed',
        email: 'renamed@example.com',
        currentPassword: 'Secret123!',
      },
      buildActor(),
      translate,
      res,
    );

    expect(execute).toHaveBeenCalledWith({
      actorId: 101,
      name: 'Actor Renamed',
      email: 'renamed@example.com',
      currentPassword: 'Secret123!',
    });
    expect(result).toBeInstanceOf(UserDetailResponseDto);
    expect(result).not.toHaveProperty('password');
    expect(clearCookie).toHaveBeenCalledWith(
      'access_token',
      expect.objectContaining({ path: '/api' }),
    );
    expect(clearCookie).toHaveBeenCalledWith(
      'refresh_token',
      expect.objectContaining({ path: '/api/auth/refresh' }),
    );
  });

  it('updateMe does not clear the auth cookies when the update fails', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('boom'));
    const controller = buildController({ updateOwnProfile: { execute } });
    const { res, clearCookie } = buildResponse();

    await expect(
      controller.updateMe({ name: 'Actor' }, buildActor(), translate, res),
    ).rejects.toThrow('boom');
    expect(clearCookie).not.toHaveBeenCalled();
  });

  it('changeMyPassword forwards only the passwords and the actor id, clears the auth cookies, and returns no data', async () => {
    const execute = jest.fn().mockResolvedValue(undefined);
    const controller = buildController({ changeOwnPassword: { execute } });
    const { res, clearCookie } = buildResponse();

    const result = await controller.changeMyPassword(
      { currentPassword: 'Secret123!', newPassword: 'N3wSecret123!' },
      buildActor(),
      res,
    );

    expect(execute).toHaveBeenCalledWith({
      actorId: 101,
      currentPassword: 'Secret123!',
      newPassword: 'N3wSecret123!',
    });
    expect(result).toBeNull();
    expect(clearCookie).toHaveBeenCalledWith(
      'access_token',
      expect.objectContaining({ path: '/api' }),
    );
    expect(clearCookie).toHaveBeenCalledWith(
      'refresh_token',
      expect.objectContaining({ path: '/api/auth/refresh' }),
    );
  });

  it('changeMyPassword does not clear the auth cookies when the change fails', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('boom'));
    const controller = buildController({ changeOwnPassword: { execute } });
    const { res, clearCookie } = buildResponse();

    await expect(
      controller.changeMyPassword(
        { currentPassword: 'Wrong123!', newPassword: 'N3wSecret123!' },
        buildActor(),
        res,
      ),
    ).rejects.toThrow('boom');
    expect(clearCookie).not.toHaveBeenCalled();
  });

  describe('GET me endpoint() route metadata', () => {
    it('requires no ability (unlike findAll/findOne)', () => {
      expect(
        Reflect.getMetadata(ABILITY_METADATA_KEY, findMeHandler),
      ).toBeUndefined();
    });

    it('sets the success.ok i18n key', () => {
      expect(
        Reflect.getMetadata(SUCCESS_MESSAGE_METADATA_KEY, findMeHandler),
      ).toBe('success.ok');
    });

    it('is not audited', () => {
      expect(
        Reflect.getMetadata(AUDIT_METADATA_KEY, findMeHandler),
      ).toBeUndefined();
    });

    it('documents the route under the "users" Swagger tag', () => {
      const tags = Reflect.getMetadata(
        DECORATORS.API_TAGS,
        findMeHandler,
      ) as string[];

      expect(tags).toContain('users');
    });

    it('maps to the "me" path', () => {
      expect(Reflect.getMetadata(PATH_METADATA, findMeHandler)).toBe('me');
    });
  });

  describe('GET me/abilities endpoint() route metadata', () => {
    it('requires no ability, so every authenticated user can read their own', () => {
      expect(
        Reflect.getMetadata(ABILITY_METADATA_KEY, findMyAbilitiesHandler),
      ).toBeUndefined();
    });

    it('sets the success.ok i18n key', () => {
      expect(
        Reflect.getMetadata(
          SUCCESS_MESSAGE_METADATA_KEY,
          findMyAbilitiesHandler,
        ),
      ).toBe('success.ok');
    });

    it('is not audited', () => {
      expect(
        Reflect.getMetadata(AUDIT_METADATA_KEY, findMyAbilitiesHandler),
      ).toBeUndefined();
    });

    it('documents the route under the "users" Swagger tag', () => {
      const tags = Reflect.getMetadata(
        DECORATORS.API_TAGS,
        findMyAbilitiesHandler,
      ) as string[];

      expect(tags).toContain('users');
    });

    it('maps to the "me/abilities" path', () => {
      expect(Reflect.getMetadata(PATH_METADATA, findMyAbilitiesHandler)).toBe(
        'me/abilities',
      );
    });
  });

  describe('PATCH me endpoint() route metadata', () => {
    it('requires no ability, so any authenticated user can update their own profile', () => {
      expect(
        Reflect.getMetadata(ABILITY_METADATA_KEY, updateMeHandler),
      ).toBeUndefined();
    });

    it('audits as User.update_profile', () => {
      expect(Reflect.getMetadata(AUDIT_METADATA_KEY, updateMeHandler)).toBe(
        'User.update_profile',
      );
    });

    it('sets the success.updated i18n key', () => {
      expect(
        Reflect.getMetadata(SUCCESS_MESSAGE_METADATA_KEY, updateMeHandler),
      ).toBe('success.updated');
    });

    it('documents the route under the "users" Swagger tag', () => {
      const tags = Reflect.getMetadata(
        DECORATORS.API_TAGS,
        updateMeHandler,
      ) as string[];

      expect(tags).toContain('users');
    });

    it('documents a body that exposes only name, email, and currentPassword', () => {
      const params = Reflect.getMetadata(
        DECORATORS.API_PARAMETERS,
        updateMeHandler,
      ) as Array<{ in: string; type: { prototype: object } }>;

      const body = params.find((param) => param.in === 'body');

      const properties = Reflect.getMetadata(
        DECORATORS.API_MODEL_PROPERTIES_ARRAY,
        body!.type.prototype,
      ) as string[];

      expect(properties.map((name) => name.replace(/^:/, '')).sort()).toEqual([
        'currentPassword',
        'email',
        'name',
      ]);
    });

    it('uses the login rate limit, since it verifies the current password', () => {
      expect(
        Reflect.getMetadata(
          PUBLIC_AUTH_FLOW_THROTTLE_METADATA_KEY,
          updateMeHandler,
        ),
      ).toBe(true);
    });

    it('maps to the "me" path', () => {
      expect(Reflect.getMetadata(PATH_METADATA, updateMeHandler)).toBe('me');
    });
  });

  describe('PATCH me/password endpoint() route metadata', () => {
    it('requires no ability, so any authenticated user can change their own password', () => {
      expect(
        Reflect.getMetadata(ABILITY_METADATA_KEY, changeMyPasswordHandler),
      ).toBeUndefined();
    });

    it('audits as User.change_password', () => {
      expect(
        Reflect.getMetadata(AUDIT_METADATA_KEY, changeMyPasswordHandler),
      ).toBe('User.change_password');
    });

    it('sets the users.success.password_changed i18n key', () => {
      expect(
        Reflect.getMetadata(
          SUCCESS_MESSAGE_METADATA_KEY,
          changeMyPasswordHandler,
        ),
      ).toBe('users.success.password_changed');
    });

    it('documents the route under the "users" Swagger tag', () => {
      const tags = Reflect.getMetadata(
        DECORATORS.API_TAGS,
        changeMyPasswordHandler,
      ) as string[];

      expect(tags).toContain('users');
    });

    it('documents a body that exposes only currentPassword and newPassword', () => {
      const params = Reflect.getMetadata(
        DECORATORS.API_PARAMETERS,
        changeMyPasswordHandler,
      ) as Array<{ in: string; type: { prototype: object } }>;

      const body = params.find((param) => param.in === 'body');

      const properties = Reflect.getMetadata(
        DECORATORS.API_MODEL_PROPERTIES_ARRAY,
        body!.type.prototype,
      ) as string[];

      expect(properties.map((name) => name.replace(/^:/, '')).sort()).toEqual([
        'currentPassword',
        'newPassword',
      ]);
    });

    it('uses the login rate limit, since it verifies the current password', () => {
      expect(
        Reflect.getMetadata(
          PUBLIC_AUTH_FLOW_THROTTLE_METADATA_KEY,
          changeMyPasswordHandler,
        ),
      ).toBe(true);
    });

    it('maps to the "me/password" path', () => {
      expect(Reflect.getMetadata(PATH_METADATA, changeMyPasswordHandler)).toBe(
        'me/password',
      );
    });
  });
});
