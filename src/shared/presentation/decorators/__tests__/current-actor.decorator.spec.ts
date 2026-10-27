import 'reflect-metadata';
import type { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { UnauthorizedError } from '@shared/domain/errors';
import type { AuthenticatedUser } from '../../http/authenticated-user.type';
import { CurrentActor } from '../current-actor.decorator';

type CurrentActorFactory = (
  data: unknown,
  context: ExecutionContext,
) => AuthenticatedUser;

// Nest stores custom param decorator factories in route-args metadata; reading
// it back exercises the same factory the router calls per request.
function getCurrentActorFactory(): CurrentActorFactory {
  class ProbeController {
    handle(@CurrentActor() actor: AuthenticatedUser): AuthenticatedUser {
      return actor;
    }
  }

  const args = Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    ProbeController,
    'handle',
  ) as Record<string, { factory: CurrentActorFactory }>;

  return Object.values(args)[0].factory;
}

function buildContext(user: AuthenticatedUser | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('CurrentActor', () => {
  const factory = getCurrentActorFactory();

  it('returns the authenticated user populated by JwtAuthGuard', () => {
    const user: AuthenticatedUser = {
      id: 1,
      uuid: 'user-uuid',
      email: 'jane@example.com',
      name: 'Jane Doe',
      roles: ['ADMIN'],
    };

    expect(factory(undefined, buildContext(user))).toBe(user);
  });

  it('throws UnauthorizedError when the request has no authenticated user', () => {
    expect(() => factory(undefined, buildContext(undefined))).toThrow(
      UnauthorizedError,
    );
  });
});
