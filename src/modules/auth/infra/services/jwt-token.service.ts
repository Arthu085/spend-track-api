import { Injectable } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ITokenService } from '../../domain/services/token.service';
import { getJwtConfig } from 'src/core/config/auth/jwt.config';
import { EnvOptions } from 'src/core/config/env/types/env.types';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../../domain/types/jwt-payload.type';

@Injectable()
export class JwtTokenService implements ITokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  generateAccessToken(payload: JwtPayload): string {
    const env = this.configService.get<EnvOptions>('env')!;
    const jwtConf = getJwtConfig(env);
    const options: JwtSignOptions = {
      secret: jwtConf.access.secret,
      expiresIn: jwtConf.access.expiresIn,
    };

    const token = this.jwtService.sign(payload, options);
    return token;
  }

  generateRefreshToken(payload: JwtPayload): string {
    const env = this.configService.get<EnvOptions>('env')!;
    const jwtConf = getJwtConfig(env);
    const options: JwtSignOptions = {
      secret: jwtConf.refresh.secret,
      expiresIn: jwtConf.refresh.expiresIn,
    };

    const token = this.jwtService.sign(payload, options);
    return token;
  }

  verifyAccessToken(token: string): JwtPayload {
    const env = this.configService.get<EnvOptions>('env')!;
    const jwtConf = getJwtConfig(env);
    return this.jwtService.verify<JwtPayload>(token, {
      secret: jwtConf.access.secret,
    });
  }

  verifyRefreshToken(token: string): JwtPayload {
    const env = this.configService.get<EnvOptions>('env')!;
    const jwtConf = getJwtConfig(env);
    return this.jwtService.verify<JwtPayload>(token, {
      secret: jwtConf.refresh.secret,
    });
  }
}
