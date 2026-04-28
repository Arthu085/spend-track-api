import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from 'src/modules/auth/domain/types/auth-user.type';
import { RequestWithUser } from '../api/types/request-with-user.type';
import { AppUnauthorizedException } from '../exceptions/app-unauthorized.exception';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();

    if (!request.user) {
      throw new AppUnauthorizedException({
        message: 'Usuário não encontrado no request',
      });
    }

    return request.user;
  },
);
