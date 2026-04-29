import { AuthGuard } from '@nestjs/passport';
import { AppUnauthorizedException } from 'src/core/exceptions/app-unauthorized.exception';
import { AuthUser } from '../../domain/types/auth-user.type';

export class JwtRefreshAuthGuard extends AuthGuard('jwt-refresh') {
  handleRequest<TUser = AuthUser>(err: unknown, user: unknown): TUser {
    if (err || !user) {
      throw new AppUnauthorizedException({
        message: 'Token inválido ou não informado',
      });
    }

    return user as TUser;
  }
}
