import { Injectable } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ITokenService } from '../../domain/services/token.service';
import { jwtConfig } from 'src/core/config/auth/jwt.config';
import { JwtPayload } from '../../domain/types/jwt-payload.type';

@Injectable()
export class JwtTokenService implements ITokenService {
  constructor(private readonly jwtService: JwtService) {}

  generateAccessToken(payload: JwtPayload): string {
    const options: JwtSignOptions = {
      secret: jwtConfig.access.secret,
      expiresIn: jwtConfig.access.expiresIn,
    };

    const token = this.jwtService.sign(payload, options);
    return token;
  }

  generateRefreshToken(payload: JwtPayload): string {
    const options: JwtSignOptions = {
      secret: jwtConfig.refresh.secret,
      expiresIn: jwtConfig.refresh.expiresIn,
    };

    const token = this.jwtService.sign(payload, options);
    return token;
  }

  verifyAccessToken(token: string): JwtPayload {
    return this.jwtService.verify<JwtPayload>(token, {
      secret: jwtConfig.access.secret,
    });
  }

  verifyRefreshToken(token: string): JwtPayload {
    return this.jwtService.verify<JwtPayload>(token, {
      secret: jwtConfig.refresh.secret,
    });
  }
}
