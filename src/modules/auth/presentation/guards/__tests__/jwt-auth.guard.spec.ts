import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { UnauthorizedError } from '@shared/domain/errors';
import { EmailNotConfirmedError } from '../../../domain/errors/email-not-confirmed.error';
import { JwtAuthGuard } from '../jwt-auth.guard';

// `AuthGuard('jwt')` (from `@nestjs/passport`) is a mixin factory: the parent
// class `JwtAuthGuard` actually extends is fixed at import time, so spying on
// it requires walking the real prototype chain rather than calling
// `AuthGuard('jwt')` again (which would mint an unrelated class).
const passportGuardPrototype = Object.getPrototypeOf(
  JwtAuthGuard.prototype,
) as { canActivate: (context: ExecutionContext) => unknown };

function buildContext(overrides: {
  type?: string;
  isPublic?: boolean | undefined;
}): {
  context: ExecutionContext;
  reflector: Reflector;
  getAllAndOverride: jest.Mock;
} {
  const getAllAndOverride = jest.fn().mockReturnValue(overrides.isPublic);
  const reflector = { getAllAndOverride } as unknown as Reflector;

  const context = {
    getType: () => overrides.type ?? 'http',
    getHandler: () => jest.fn(),
    getClass: () => class {},
  } as unknown as ExecutionContext;

  return { context, reflector, getAllAndOverride };
}

describe('JwtAuthGuard', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('canActivate', () => {
    it('bypasses (returns true) for non-http contexts without consulting the reflector', () => {
      const { context, reflector, getAllAndOverride } = buildContext({
        type: 'rpc',
      });

      const guard = new JwtAuthGuard(reflector);

      expect(guard.canActivate(context)).toBe(true);
      expect(getAllAndOverride).not.toHaveBeenCalled();
    });

    it('bypasses (returns true) when the route is marked public', () => {
      const { context, reflector } = buildContext({ isPublic: true });
      const guard = new JwtAuthGuard(reflector);

      const superSpy = jest.spyOn(passportGuardPrototype, 'canActivate');

      expect(guard.canActivate(context)).toBe(true);
      expect(superSpy).not.toHaveBeenCalled();
    });

    it('delegates to the passport AuthGuard when the route is not public', () => {
      const { context, reflector } = buildContext({ isPublic: undefined });
      const guard = new JwtAuthGuard(reflector);

      const superSpy = jest
        .spyOn(passportGuardPrototype, 'canActivate')
        .mockReturnValue(true);

      expect(guard.canActivate(context)).toBe(true);
      expect(superSpy).toHaveBeenCalledWith(context);
    });
  });

  describe('handleRequest', () => {
    const guard = new JwtAuthGuard({} as Reflector);

    it('throws the domain unauthenticated error when passport reports an error', () => {
      expect(() => guard.handleRequest(new Error('boom'), false)).toThrow(
        UnauthorizedError,
      );
    });

    it('rethrows a domain error from token validation unchanged, so an unconfirmed email stays a 403', () => {
      const error = new EmailNotConfirmedError();

      expect(() => guard.handleRequest(error, false)).toThrow(error);
    });

    it('throws the domain unauthenticated error when no user was resolved', () => {
      expect(() => guard.handleRequest(null, false)).toThrow(UnauthorizedError);
    });

    it('returns the user when authentication succeeded', () => {
      const user = { uuid: 'user-uuid' };

      expect(guard.handleRequest(null, user)).toBe(user);
    });
  });
});
