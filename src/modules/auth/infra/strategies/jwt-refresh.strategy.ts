import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import * as bcrypt from 'bcrypt';
import { getJwtConfig } from 'src/core/config/auth/jwt.config';
import { EnvOptions } from 'src/core/config/env/types/env.types';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../../domain/types/jwt-payload.type';
import { AuthUser } from '../../domain/types/auth-user.type';
import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import { AppUnauthorizedException } from 'src/core/exceptions/app-unauthorized.exception';
import { IUserRepository } from 'src/modules/user/domain/repositories/user.repository.interface';
import { StatusEnum } from 'src/core/domain/enums/status.enum';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    @Inject('IUserRepository')
    private readonly userRepo: IUserRepository,
    private readonly configService: ConfigService,
  ) {
    const env = configService.get<EnvOptions>('env')!;
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request): string | null =>
          (req?.cookies?.refreshToken as string) || null,
      ]),
      secretOrKey: getJwtConfig(env).refresh.secret,
      ignoreExpiration: false,
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload): Promise<AuthUser> {
    const refreshToken = (req?.cookies?.refreshToken as string) || null;
    if (!refreshToken) {
      throw new AppUnauthorizedException({
        message: 'Refresh token não fornecido',
      });
    }

    const user = await this.userRepo.findByUuid(Uuid.from(payload.sub));

    if (!user) {
      throw new AppUnauthorizedException({ message: 'Usuário não encontrado' });
    }

    if (user.status !== StatusEnum.ACTIVE) {
      throw new AppUnauthorizedException({ message: 'Usuário inativo' });
    }

    if (!user.hashedRefreshToken) {
      throw new AppUnauthorizedException({ message: 'Sessão inválida' });
    }

    const isMatch = await bcrypt.compare(refreshToken, user.hashedRefreshToken);

    if (!isMatch) {
      throw new AppUnauthorizedException({
        message: 'Sessão inválida ou expirada',
      });
    }

    return {
      uuid: user.uuid.toString(),
      roleUuid: user.role.uuid.toString(),
    };
  }
}
