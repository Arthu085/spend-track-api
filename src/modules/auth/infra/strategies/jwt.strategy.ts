import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { jwtConfig } from 'src/core/config/auth/jwt.config';
import { JwtPayload } from '../../domain/types/jwt-payload.type';
import { IUserRepository } from 'src/modules/user/domain/repositories/user.repository.interface';
import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import { StatusEnum } from 'src/core/domain/enums/status.enum';
import { AppUnauthorizedException } from 'src/core/exceptions/app-unauthorized.exception';
import { AuthUser } from '../../domain/types/auth-user.type';

export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly userRepo: IUserRepository) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: jwtConfig.access.secret,
      ignoreExpiration: false,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.userRepo.findByUuid(Uuid.from(payload.sub));

    if (!user) {
      throw new AppUnauthorizedException({ message: 'Usuário não encontrado' });
    }

    if (user.status !== StatusEnum.ACTIVE) {
      throw new AppUnauthorizedException({ message: 'Usuário inativo' });
    }

    return {
      uuid: user.uuid.toString(),
      roleUuid: user.roleUuid.toString(),
    };
  }
}
