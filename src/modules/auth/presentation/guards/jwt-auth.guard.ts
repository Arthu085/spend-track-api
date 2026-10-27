import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { DomainError, UnauthorizedError } from '@shared/domain/errors';
import { PUBLIC_METADATA_KEY } from '@shared/presentation/metadata';
import type { AuthenticatedUser } from '@shared/presentation/http';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      PUBLIC_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isPublic === true) {
      return true;
    }

    return super.canActivate(context) as boolean | Promise<boolean>;
  }

  handleRequest<TUser = AuthenticatedUser>(
    err: unknown,
    user: TUser | false,
  ): TUser {
    if (err instanceof DomainError) {
      throw err;
    }

    if (err !== null && err !== undefined) {
      throw new UnauthorizedError('auth.errors.unauthenticated');
    }

    if (!user) {
      throw new UnauthorizedError('auth.errors.unauthenticated');
    }

    return user;
  }
}
