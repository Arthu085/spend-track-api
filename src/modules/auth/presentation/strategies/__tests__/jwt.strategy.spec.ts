import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AppConfigService } from '@core/config';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { UnauthorizedError } from '@shared/domain/errors';
import { RoleEnum } from '@modules/authorization/domain/enums/role.enum';
import type { AuthSubject } from '@modules/users/domain/repositories/user.repository';
import type { ValidateAccessTokenUserUseCase } from '../../../application/use-cases/validate-access-token-user.use-case';
import { NestJwtTokenService } from '../../../infrastructure/jwt/nest-jwt-token.service';
import { ACCESS_TOKEN_COOKIE } from '../../http/auth-cookie.constants';
import { JwtTokenKind } from '../../../infrastructure/jwt/jwt-claims';
import { JwtStrategy } from '../jwt.strategy';

function buildConfig(): AppConfigService {
  return {
    jwt: { accessSecret: 'access-secret' },
  } as unknown as AppConfigService;
}

// Both kinds share one secret so the strategy tests prove the kind claims, not secret separation,
// reject a token of the wrong kind.
function buildSharedSecretConfig(): AppConfigService {
  return {
    jwt: {
      accessSecret: 'shared-secret',
      accessTtl: '15m',
      refreshSecret: 'shared-secret',
      refreshTtl: '7d',
    },
  } as unknown as AppConfigService;
}

type AuthenticateOutcome =
  | { kind: 'success'; user: unknown }
  | { kind: 'fail' }
  | { kind: 'error'; error: unknown };

// Drives passport-jwt's real extraction and signature/claim verification, then validate().
function authenticate(
  strategy: JwtStrategy,
  token: string,
): Promise<AuthenticateOutcome> {
  return new Promise((resolve) => {
    Object.assign(strategy, {
      success: (user: unknown) => resolve({ kind: 'success', user }),
      fail: () => resolve({ kind: 'fail' }),
      error: (error: unknown) => resolve({ kind: 'error', error }),
    });

    strategy.authenticate({
      signedCookies: { [ACCESS_TOKEN_COOKIE]: token },
    } as unknown as Request);
  });
}

function buildSubject(roleNames: RoleEnum[]): AuthSubject {
  return {
    id: 1,
    uuid: 'user-uuid',
    status: RecordStatus.ACTIVE,
    name: 'Jane Doe',
    email: 'jane@example.com',
    emailConfirmedAt: new Date(),
    roleNames,
  };
}

describe('JwtStrategy', () => {
  it('validate() resolves the auth subject via the use-case and maps it into AuthenticatedUser', async () => {
    const execute = jest
      .fn()
      .mockResolvedValue(buildSubject([RoleEnum.ADMIN, RoleEnum.USER]));

    const strategy = new JwtStrategy(buildConfig(), {
      execute,
    } as unknown as ValidateAccessTokenUserUseCase);

    const result = await strategy.validate({
      sub: 'user-uuid',
      email: 'jane@example.com',
      sid: 'session-1',
      typ: JwtTokenKind.ACCESS,
    });

    expect(execute).toHaveBeenCalledWith({
      userUuid: 'user-uuid',
      sessionId: 'session-1',
    });
    expect(result).toEqual({
      id: 1,
      uuid: 'user-uuid',
      email: 'jane@example.com',
      name: 'Jane Doe',
      roles: [RoleEnum.ADMIN, RoleEnum.USER],
    });
  });

  it('propagates the use-case rejection when the user cannot be validated', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('unauthenticated'));

    const strategy = new JwtStrategy(buildConfig(), {
      execute,
    } as unknown as ValidateAccessTokenUserUseCase);

    await expect(
      strategy.validate({
        sub: 'missing',
        email: 'missing@example.com',
        sid: 'session-1',
        typ: JwtTokenKind.ACCESS,
      }),
    ).rejects.toThrow('unauthenticated');
  });

  it('validate() rejects a payload whose typ claim is not access, without resolving the user', async () => {
    const execute = jest.fn();

    const strategy = new JwtStrategy(buildConfig(), {
      execute,
    } as unknown as ValidateAccessTokenUserUseCase);

    await expect(
      strategy.validate({
        sub: 'user-uuid',
        email: 'jane@example.com',
        sid: 'session-1',
        typ: JwtTokenKind.REFRESH,
      }),
    ).rejects.toThrow(UnauthorizedError);
    await expect(
      strategy.validate({
        sub: 'user-uuid',
        email: 'jane@example.com',
        sid: 'session-1',
      }),
    ).rejects.toThrow(UnauthorizedError);
    expect(execute).not.toHaveBeenCalled();
  });

  // Without a session id the CSRF check cannot bind to this token, so an
  // access token issued before session binding must not authenticate either.
  it('validate() rejects an access payload without a session id, without resolving the user', async () => {
    const execute = jest.fn();

    const strategy = new JwtStrategy(buildConfig(), {
      execute,
    } as unknown as ValidateAccessTokenUserUseCase);

    await expect(
      strategy.validate({
        sub: 'user-uuid',
        email: 'jane@example.com',
        typ: JwtTokenKind.ACCESS,
      }),
    ).rejects.toThrow(UnauthorizedError);
    expect(execute).not.toHaveBeenCalled();
  });

  describe('token verification', () => {
    const jwtService = new JwtService({});

    const tokenService = new NestJwtTokenService(
      jwtService,
      buildSharedSecretConfig(),
    );

    function buildStrategy(execute: jest.Mock): JwtStrategy {
      return new JwtStrategy(buildSharedSecretConfig(), {
        execute,
      } as unknown as ValidateAccessTokenUserUseCase);
    }

    it('authenticates an access token issued by the token service', async () => {
      const execute = jest.fn().mockResolvedValue(buildSubject([]));

      const outcome = await authenticate(
        buildStrategy(execute),
        tokenService.signAccessToken({
          sub: 'user-uuid',
          email: 'jane@example.com',
          sid: 'session-1',
        }),
      );

      expect(outcome).toMatchObject({
        kind: 'success',
        user: { uuid: 'user-uuid' },
      });
      expect(execute).toHaveBeenCalledWith({
        userUuid: 'user-uuid',
        sessionId: 'session-1',
      });
    });

    it('rejects a refresh token presented as an access token, even when both kinds share a secret', async () => {
      const execute = jest.fn().mockResolvedValue(buildSubject([]));

      const outcome = await authenticate(
        buildStrategy(execute),
        tokenService.signRefreshToken({
          sub: 'user-uuid',
          jti: 'jti-1',
          sid: 'session-1',
        }),
      );

      expect(outcome.kind).not.toBe('success');
      expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a token with the access audience but a non-access typ claim', async () => {
      const execute = jest.fn().mockResolvedValue(buildSubject([]));

      const outcome = await authenticate(
        buildStrategy(execute),
        jwtService.sign(
          { sub: 'user-uuid', jti: 'jti-1', typ: JwtTokenKind.REFRESH },
          {
            secret: 'shared-secret',
            algorithm: 'HS256',
            audience: 'auth:access',
          },
        ),
      );

      expect(outcome.kind).not.toBe('success');
      expect(execute).not.toHaveBeenCalled();
    });

    it('rejects an access token signed with an algorithm other than HS256', async () => {
      const execute = jest.fn().mockResolvedValue(buildSubject([]));

      const outcome = await authenticate(
        buildStrategy(execute),
        jwtService.sign(
          {
            sub: 'user-uuid',
            email: 'jane@example.com',
            typ: JwtTokenKind.ACCESS,
          },
          {
            secret: 'shared-secret',
            algorithm: 'HS512',
            audience: 'auth:access',
          },
        ),
      );

      expect(outcome.kind).not.toBe('success');
      expect(execute).not.toHaveBeenCalled();
    });
  });
});
