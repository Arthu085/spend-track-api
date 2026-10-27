import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { AppConfigService } from '@core/config';
import { UnauthorizedError } from '@shared/domain/errors';
import { ValidateAccessTokenUserUseCase } from '../../application/use-cases/validate-access-token-user.use-case';
import { AccessTokenPayload } from '../../application/ports/token-service.port';
import {
  JWT_ALGORITHM,
  JWT_AUDIENCE,
  JwtTokenKind,
  JwtTokenKindClaim,
} from '../../infrastructure/jwt/jwt-claims';
import type { AuthenticatedUser } from '@shared/presentation/http';
import { jwtCookieExtractor } from './jwt-cookie.extractor';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: AppConfigService,
    private readonly validateAccessTokenUser: ValidateAccessTokenUserUseCase,
  ) {
    super({
      jwtFromRequest: jwtCookieExtractor,
      secretOrKey: config.jwt.accessSecret,
      ignoreExpiration: false,
      algorithms: [JWT_ALGORITHM],
      audience: JWT_AUDIENCE[JwtTokenKind.ACCESS],
    });
  }

  async validate(
    payload: Partial<AccessTokenPayload & JwtTokenKindClaim>,
  ): Promise<AuthenticatedUser> {
    if (
      payload.typ !== JwtTokenKind.ACCESS ||
      typeof payload.sub !== 'string' ||
      typeof payload.sid !== 'string'
    ) {
      throw new UnauthorizedError('auth.errors.unauthenticated');
    }

    const subject = await this.validateAccessTokenUser.execute({
      userUuid: payload.sub,
      sessionId: payload.sid,
    });

    return {
      id: subject.id,
      uuid: subject.uuid,
      email: subject.email,
      name: subject.name,
      roles: subject.roleNames,
    };
  }
}
