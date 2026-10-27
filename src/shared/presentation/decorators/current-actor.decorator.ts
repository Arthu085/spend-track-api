import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { UnauthorizedError } from '../../domain/errors';
import type {
  AuthenticatedUser,
  RequestWithActor,
} from '../http/authenticated-user.type';

export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const { user } = context.switchToHttp().getRequest<RequestWithActor>();

    if (user === undefined) {
      throw new UnauthorizedError();
    }

    return user;
  },
);
