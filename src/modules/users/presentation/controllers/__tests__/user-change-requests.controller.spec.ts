import 'reflect-metadata';
import type { Response } from 'express';
import type { AppConfigService } from '@core/config';
import type { Translate } from '@shared/presentation/decorators';
import { PATH_METADATA } from '@nestjs/common/constants';
import type { AuthenticatedUser } from '@shared/presentation/http';
import { Action } from '@shared/domain/enums/action.enum';
import { Subject } from '@shared/domain/authorization/subject';
import {
  ABILITY_METADATA_KEY,
  AUDIT_METADATA_KEY,
} from '@shared/presentation/metadata';
import { UserDetailResponseDto } from '../../dto/output/user-detail.response';
import { UserChangeRequestResponseDto } from '../../dto/output/user-change-request.response';
import type { ApproveUserChangeRequestUseCase } from '../../../application/use-cases/approve-user-change-request.use-case';
import type { ListMyUserChangeRequestsUseCase } from '../../../application/use-cases/list-my-user-change-requests.use-case';
import type { RejectUserChangeRequestUseCase } from '../../../application/use-cases/reject-user-change-request.use-case';
import type { RequestUserChangeUseCase } from '../../../application/use-cases/request-user-change.use-case';
import { UserChangeRequestsController } from '../user-change-requests.controller';
import { buildUser } from '@test/support/builders/user.builder';
import { buildUserChangeRequest } from '@test/support/builders/user-change-request.builder';

// Untyped record avoids @typescript-eslint/unbound-method when reading handler
// references for Reflect.getMetadata.
const controllerHandlers =
  UserChangeRequestsController.prototype as unknown as Record<string, object>;

const findMyChangeRequestsHandler = controllerHandlers.findMyChangeRequests;
const createChangeRequestHandler = controllerHandlers.createChangeRequest;
const approveMyChangeRequestHandler = controllerHandlers.approveMyChangeRequest;
const rejectMyChangeRequestHandler = controllerHandlers.rejectMyChangeRequest;

function buildController(
  overrides: Partial<{
    listMyChangeRequests: Partial<ListMyUserChangeRequestsUseCase>;
    requestUserChange: Partial<RequestUserChangeUseCase>;
    approveChangeRequest: Partial<ApproveUserChangeRequestUseCase>;
    rejectChangeRequest: Partial<RejectUserChangeRequestUseCase>;
  }>,
): UserChangeRequestsController {
  return new UserChangeRequestsController(
    (overrides.listMyChangeRequests ?? {}) as ListMyUserChangeRequestsUseCase,
    (overrides.requestUserChange ?? {}) as RequestUserChangeUseCase,
    (overrides.approveChangeRequest ?? {}) as ApproveUserChangeRequestUseCase,
    (overrides.rejectChangeRequest ?? {}) as RejectUserChangeRequestUseCase,
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

describe('UserChangeRequestsController', () => {
  it('findMyChangeRequests lists the current actor pending requests as response DTOs', async () => {
    const execute = jest.fn().mockResolvedValue([buildUserChangeRequest()]);
    const controller = buildController({ listMyChangeRequests: { execute } });

    const result = await controller.findMyChangeRequests(
      buildActor(),
      translate,
    );

    expect(execute).toHaveBeenCalledWith(101);
    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(UserChangeRequestResponseDto);
    expect(result[0].current.name).toBe('Jane Doe');
    expect(result[0].requested.name).toBe('Jane Smith');
  });

  it('createChangeRequest forwards the uuid, DTO and current actor id', async () => {
    const execute = jest.fn().mockResolvedValue(buildUserChangeRequest());
    const controller = buildController({ requestUserChange: { execute } });

    const result = await controller.createChangeRequest(
      'admin-uuid',
      { name: 'Jane Smith', email: 'jane@example.com', roleUuids: ['r-1'] },
      buildActor(),
      translate,
    );

    expect(execute).toHaveBeenCalledWith({
      uuid: 'admin-uuid',
      name: 'Jane Smith',
      email: 'jane@example.com',
      roleUuids: ['r-1'],
      actorId: 101,
    });
    expect(result).toBeInstanceOf(UserChangeRequestResponseDto);
  });

  it('approveMyChangeRequest forwards the request uuid and actor id, clears the auth cookies, and returns the updated user', async () => {
    const execute = jest.fn().mockResolvedValue(buildUser({ id: 101 }));
    const controller = buildController({ approveChangeRequest: { execute } });
    const { res, clearCookie } = buildResponse();

    const result = await controller.approveMyChangeRequest(
      'request-uuid',
      buildActor(),
      translate,
      res,
    );

    expect(execute).toHaveBeenCalledWith({
      uuid: 'request-uuid',
      actorId: 101,
    });
    expect(result).toBeInstanceOf(UserDetailResponseDto);
    expect(clearCookie).toHaveBeenCalledWith(
      'access_token',
      expect.objectContaining({ path: '/api' }),
    );
    expect(clearCookie).toHaveBeenCalledWith(
      'refresh_token',
      expect.objectContaining({ path: '/api/auth/refresh' }),
    );
  });

  it('rejectMyChangeRequest forwards the request uuid and actor id and returns null', async () => {
    const execute = jest.fn().mockResolvedValue(undefined);
    const controller = buildController({ rejectChangeRequest: { execute } });

    await expect(
      controller.rejectMyChangeRequest('request-uuid', buildActor()),
    ).resolves.toBeNull();
    expect(execute).toHaveBeenCalledWith({
      uuid: 'request-uuid',
      actorId: 101,
    });
  });

  describe('change request endpoint() route metadata', () => {
    it('requires UPDATE and READ on the User subject to create a request', () => {
      expect(
        Reflect.getMetadata(ABILITY_METADATA_KEY, createChangeRequestHandler),
      ).toEqual([
        { action: Action.UPDATE, subject: Subject.USER },
        { action: Action.READ, subject: Subject.USER },
      ]);
    });

    it.each([
      ['findMyChangeRequests', findMyChangeRequestsHandler],
      ['approveMyChangeRequest', approveMyChangeRequestHandler],
      ['rejectMyChangeRequest', rejectMyChangeRequestHandler],
    ])(
      'requires no ability on %s, which only acts on the caller',
      (_, handler) => {
        expect(
          Reflect.getMetadata(ABILITY_METADATA_KEY, handler),
        ).toBeUndefined();
      },
    );

    it.each([
      [
        'createChangeRequest',
        createChangeRequestHandler,
        'User.request_change',
      ],
      [
        'approveMyChangeRequest',
        approveMyChangeRequestHandler,
        'User.approve_change',
      ],
      [
        'rejectMyChangeRequest',
        rejectMyChangeRequestHandler,
        'User.reject_change',
      ],
    ])('audits %s as %s', (_, handler, action) => {
      expect(Reflect.getMetadata(AUDIT_METADATA_KEY, handler)).toBe(action);
    });

    it.each([
      [
        'findMyChangeRequests',
        findMyChangeRequestsHandler,
        'me/change-requests',
      ],
      [
        'createChangeRequest',
        createChangeRequestHandler,
        ':uuid/change-requests',
      ],
      [
        'approveMyChangeRequest',
        approveMyChangeRequestHandler,
        'me/change-requests/:uuid/approve',
      ],
      [
        'rejectMyChangeRequest',
        rejectMyChangeRequestHandler,
        'me/change-requests/:uuid/reject',
      ],
    ])('maps %s to %s', (_, handler, path) => {
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
    });
  });
});
