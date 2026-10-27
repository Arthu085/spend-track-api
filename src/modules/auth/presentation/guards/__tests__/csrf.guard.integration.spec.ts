import { randomUUID } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { AppConfigService, CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import { CoreHashingModule } from '@core/hashing';
import { ForbiddenError } from '@shared/domain/errors';
import { CSRF_HEADER_NAME } from '@shared/presentation/http';
import { USER_REPOSITORY } from '@modules/users/domain/repositories/user.repository';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';
import { TypeOrmUserRepository } from '@modules/users/infrastructure/persistence/repositories/typeorm-user.repository';
import { AbilityOrmEntity } from '@modules/authorization/infrastructure/persistence/entities/ability.orm-entity';
import { RoleOrmEntity } from '@modules/authorization/infrastructure/persistence/entities/role.orm-entity';
import { TOKEN_SERVICE } from '../../../application/ports/token-service.port';
import { IssueAuthTokensService } from '../../../application/services/issue-auth-tokens.service';
import { LogoutUseCase } from '../../../application/use-cases/logout.use-case';
import { RefreshTokensUseCase } from '../../../application/use-cases/refresh-tokens.use-case';
import { InvalidRefreshTokenError } from '../../../domain/errors/invalid-refresh-token.error';
import { REFRESH_TOKEN_REPOSITORY } from '../../../domain/repositories/refresh-token.repository';
import { NestJwtTokenService } from '../../../infrastructure/jwt/nest-jwt-token.service';
import { RefreshTokenOrmEntity } from '../../../infrastructure/persistence/entities/refresh-token.orm-entity';
import { TypeOrmRefreshTokenRepository } from '../../../infrastructure/persistence/repositories/typeorm-refresh-token.repository';
import {
  ACCESS_TOKEN_COOKIE,
  CSRF_SESSION_COOKIE,
  CSRF_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from '../../http/auth-cookie.constants';
import { CsrfSessionResolver } from '../../http/csrf-session.resolver';
import { createCsrfToken } from '../../http/csrf-token';
import { CsrfGuard } from '../csrf.guard';

interface Session {
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
}

interface RequestCookies {
  access?: string;
  refresh?: string;
  csrfSession?: string;
  csrfToken: string;
}

// Wires the guard to real JWTs signed by `NestJwtTokenService` and to refresh
// rotation and logout against real Postgres, so the session id travels
// through the same tokens and rows it does in production. Requests carry
// cookie values as cookie-parser exposes them (signed cookies already
// verified), since cookie signing itself is not under test here.
describe('CsrfGuard session binding (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let guard: CsrfGuard;
  let issueAuthTokens: IssueAuthTokensService;
  let refreshTokens: RefreshTokensUseCase;
  let logout: LogoutUseCase;
  let cookieSecret: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        CoreConfigModule,
        DatabaseModule,
        CoreHashingModule,
        JwtModule.register({}),
        TypeOrmModule.forFeature([
          UserOrmEntity,
          RoleOrmEntity,
          AbilityOrmEntity,
          RefreshTokenOrmEntity,
        ]),
      ],
      providers: [
        CsrfGuard,
        CsrfSessionResolver,
        IssueAuthTokensService,
        RefreshTokensUseCase,
        LogoutUseCase,
        TypeOrmUserRepository,
        TypeOrmRefreshTokenRepository,
        { provide: USER_REPOSITORY, useExisting: TypeOrmUserRepository },
        {
          provide: REFRESH_TOKEN_REPOSITORY,
          useExisting: TypeOrmRefreshTokenRepository,
        },
        { provide: TOKEN_SERVICE, useClass: NestJwtTokenService },
      ],
    }).compile();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
    guard = moduleRef.get(CsrfGuard);
    issueAuthTokens = moduleRef.get(IssueAuthTokensService);
    refreshTokens = moduleRef.get(RefreshTokensUseCase);
    logout = moduleRef.get(LogoutUseCase);
    cookieSecret = moduleRef.get(AppConfigService).cookie.secret;
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "refresh_tokens", "users" RESTART IDENTITY CASCADE',
    );
  });

  async function insertConfirmedUser(): Promise<UserOrmEntity> {
    const userRepo = dataSource.getRepository(UserOrmEntity);

    return userRepo.save(
      userRepo.create({
        name: 'Jane Doe',
        email: `${randomUUID()}@example.com`,
        password: 'hashed:irrelevant',
        emailConfirmedAt: new Date(),
        roles: [],
      }),
    );
  }

  async function signIn(): Promise<Session> {
    const user = await insertConfirmedUser();
    const userRepository = moduleRef.get(TypeOrmUserRepository);
    const domainUser = (await userRepository.findByUuid(user.uuid))!;

    const issued = await issueAuthTokens.issue(domainUser);

    return {
      sessionId: issued.sessionId,
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      csrfToken: createCsrfToken(issued.sessionId, cookieSecret),
    };
  }

  function contextFor(
    cookies: RequestCookies,
    header: string,
  ): ExecutionContext {
    const signedCookies: Record<string, string> = {};

    if (cookies.access !== undefined) {
      signedCookies[ACCESS_TOKEN_COOKIE] = cookies.access;
    }
    if (cookies.refresh !== undefined) {
      signedCookies[REFRESH_TOKEN_COOKIE] = cookies.refresh;
    }
    if (cookies.csrfSession !== undefined) {
      signedCookies[CSRF_SESSION_COOKIE] = cookies.csrfSession;
    }

    const request = {
      method: 'POST',
      cookies: { [CSRF_TOKEN_COOKIE]: cookies.csrfToken },
      signedCookies,
      headers: { [CSRF_HEADER_NAME]: header },
    } as unknown as Request;

    return {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  it('accepts a token bound to the session named by the access token', async () => {
    const session = await signIn();

    await expect(
      guard.canActivate(
        contextFor(
          { access: session.accessToken, csrfToken: session.csrfToken },
          session.csrfToken,
        ),
      ),
    ).resolves.toBe(true);
  });

  it('rejects a token from another session reused with this session cookies', async () => {
    const victim = await signIn();
    const attacker = await signIn();

    await expect(
      guard.canActivate(
        contextFor(
          { access: victim.accessToken, csrfToken: attacker.csrfToken },
          attacker.csrfToken,
        ),
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  it('rejects a transplanted csrf_session cookie while a valid access token names another session', async () => {
    const victim = await signIn();
    const attacker = await signIn();

    await expect(
      guard.canActivate(
        contextFor(
          {
            access: victim.accessToken,
            csrfSession: attacker.sessionId,
            csrfToken: attacker.csrfToken,
          },
          attacker.csrfToken,
        ),
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  it('rejects a tampered token bound to the right session', async () => {
    const session = await signIn();
    const [nonce, signature] = session.csrfToken.split('.');
    const tampered = `${signature}.${nonce}`;

    await expect(
      guard.canActivate(
        contextFor(
          { access: session.accessToken, csrfToken: tampered },
          tampered,
        ),
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  it('keeps the token valid across refresh rotation, with or without the expired access token', async () => {
    const session = await signIn();

    await expect(
      guard.canActivate(
        contextFor(
          { refresh: session.refreshToken, csrfToken: session.csrfToken },
          session.csrfToken,
        ),
      ),
    ).resolves.toBe(true);

    const rotated = await refreshTokens.execute({
      refreshToken: session.refreshToken,
    });

    expect(rotated.sessionId).toBe(session.sessionId);

    await expect(
      guard.canActivate(
        contextFor(
          {
            access: rotated.accessToken,
            refresh: rotated.refreshToken,
            csrfToken: session.csrfToken,
          },
          session.csrfToken,
        ),
      ),
    ).resolves.toBe(true);
  });

  it('rejects a refresh whose CSRF token belongs to another session', async () => {
    const victim = await signIn();
    const attacker = await signIn();

    await expect(
      guard.canActivate(
        contextFor(
          {
            refresh: victim.refreshToken,
            csrfSession: attacker.sessionId,
            csrfToken: attacker.csrfToken,
          },
          attacker.csrfToken,
        ),
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  it('gives every login its own session, even for the same user', async () => {
    const user = await insertConfirmedUser();

    const domainUser = (await moduleRef
      .get(TypeOrmUserRepository)
      .findByUuid(user.uuid))!;

    const first = await issueAuthTokens.issue(domainUser);
    const second = await issueAuthTokens.issue(domainUser);
    const firstToken = createCsrfToken(first.sessionId, cookieSecret);

    expect(second.sessionId).not.toBe(first.sessionId);
    await expect(
      guard.canActivate(
        contextFor(
          { access: second.accessToken, csrfToken: firstToken },
          firstToken,
        ),
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  it('revokes the session refresh token on logout, so the session cannot be renewed', async () => {
    const session = await signIn();

    const userUuid = (
      await dataSource.query<Array<{ uuid: string }>>(
        'SELECT uuid FROM "users" LIMIT 1',
      )
    )[0].uuid;

    await logout.execute({ userUuid });

    await expect(
      refreshTokens.execute({ refreshToken: session.refreshToken }),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);
  });
});
