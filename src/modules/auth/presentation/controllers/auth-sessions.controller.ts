import {
  Body,
  Controller,
  Header,
  HttpStatus,
  Inject,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppConfigService } from '@core/config';
import { UserDetailResponseDto } from '@modules/users/presentation';
import { endpoint } from '@shared/presentation/builders';
import { PublicAuthFlowThrottle } from '@shared/presentation/throttling';
import {
  CurrentActor,
  Translator,
  type Translate,
} from '@shared/presentation/decorators';
import type { AuthenticatedUser } from '@shared/presentation/http';
import {
  attachAuditActor,
  type AuditCapableRequest,
} from '@shared/presentation/metadata';
import { LoginUseCase } from '../../application/use-cases/login.use-case';
import { LogoutUseCase } from '../../application/use-cases/logout.use-case';
import { RefreshTokensUseCase } from '../../application/use-cases/refresh-tokens.use-case';
import {
  TOKEN_SERVICE,
  type TokenService,
} from '../../application/ports/token-service.port';
import { LoginDto } from '../dto/input/login.dto';
import { CsrfTokenResponseDto } from '../dto/output/csrf-token.response';
import {
  clearAuthCookies,
  issueCsrfCookies,
  issueSessionCookies,
} from '../http/auth-cookies';
import {
  CSRF_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from '../http/auth-cookie.constants';
import { CsrfSessionResolver } from '../http/csrf-session.resolver';
import { createCsrfSessionId } from '../http/csrf-token';

@Controller('auth')
export class AuthSessionsController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshTokensUseCase: RefreshTokensUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    private readonly csrfSessionResolver: CsrfSessionResolver,
    private readonly config: AppConfigService,
  ) {}

  @(endpoint()
    .get('csrf')
    .public()
    .successMessage('success.ok')
    .use(Header('Cache-Control', 'no-store'))
    .tags('auth')
    .summary('Issue the CSRF token cookie and return its value')
    .description(
      'Sets the readable csrf_token cookie and returns the same value as ' +
        'data.csrfToken (and in the X-CSRF-Token response header), so a ' +
        'frontend on another origin (which cannot read the cookie) can send ' +
        'it in X-CSRF-Token. The token is bound to the current session: the ' +
        'session of a valid access token cookie, else the session (signed-in ' +
        'or anonymous) held in the httpOnly csrf_session cookie, else a new ' +
        'anonymous pre-session. A token already held in the cookie and bound ' +
        'to that session is returned unchanged; otherwise a new one is minted.',
    )
    .response(CsrfTokenResponseDto)
    .build())
  async csrf(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CsrfTokenResponseDto> {
    const sessionId =
      (await this.csrfSessionResolver.resolve(req)) ?? createCsrfSessionId();

    const csrfToken = issueCsrfCookies(
      res,
      this.config.cookie,
      { sessionId, ttlMs: this.tokenService.refreshTtlMs() },
      req.cookies[CSRF_TOKEN_COOKIE],
    );

    return CsrfTokenResponseDto.fromToken(csrfToken);
  }

  @(endpoint()
    .post('login')
    .public()
    .httpCode(HttpStatus.OK)
    .audit('Auth.login')
    .successMessage('auth.success.logged_in')
    .use(PublicAuthFlowThrottle())
    .tags('auth')
    .summary('Authenticate with email and password')
    .description(
      'Starts a new session and replaces the CSRF token with one bound to ' +
        'it. The new token is set in the csrf_token cookie and returned in ' +
        'the X-CSRF-Token response header; the token sent with this request ' +
        'stops working.',
    )
    .errorResponse(
      HttpStatus.UNAUTHORIZED,
      'Invalid credentials, or the user is inactive.',
    )
    .errorResponse(HttpStatus.FORBIDDEN, 'Email not confirmed.')
    .body(LoginDto)
    .response(UserDetailResponseDto)
    .build())
  async login(
    @Body() dto: LoginDto,
    @Req() req: AuditCapableRequest,
    @Res({ passthrough: true }) res: Response,
    @Translator() translate: Translate,
  ): Promise<UserDetailResponseDto> {
    const result = await this.loginUseCase.execute({
      email: dto.email,
      password: dto.password,
    });

    attachAuditActor(req, result.user.uuid);

    issueSessionCookies(
      res,
      {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        accessTtlMs: this.tokenService.accessTtlMs(),
        refreshTtlMs: this.tokenService.refreshTtlMs(),
        sessionId: result.sessionId,
      },
      this.config.cookie,
      req.cookies[CSRF_TOKEN_COOKIE],
    );

    return UserDetailResponseDto.fromDomain(result.user, translate);
  }

  @(endpoint()
    .post('refresh')
    .public()
    .httpCode(HttpStatus.OK)
    .audit('Auth.refresh')
    .successMessage('auth.success.refreshed')
    .use(PublicAuthFlowThrottle())
    .tags('auth')
    .summary('Rotate the refresh token and re-issue an access token')
    .description(
      'Keeps the session, so the current CSRF token stays valid. Its value ' +
        'is re-set in the csrf_token cookie and returned in the X-CSRF-Token ' +
        'response header. The CSRF check binds to the refresh token cookie, ' +
        'so it works after the access token has expired.',
    )
    .errorResponse(
      HttpStatus.UNAUTHORIZED,
      'The refresh token cookie is missing, invalid, expired, or revoked.',
    )
    .errorResponse(HttpStatus.FORBIDDEN, 'Email not confirmed.')
    .response(UserDetailResponseDto)
    .build())
  async refresh(
    @Req() req: AuditCapableRequest,
    @Res({ passthrough: true }) res: Response,
    @Translator() translate: Translate,
  ): Promise<UserDetailResponseDto> {
    const rawRefreshToken: unknown = req.signedCookies[REFRESH_TOKEN_COOKIE];

    const refreshToken =
      typeof rawRefreshToken === 'string' ? rawRefreshToken : undefined;

    const result = await this.refreshTokensUseCase.execute({ refreshToken });

    attachAuditActor(req, result.user.uuid);

    issueSessionCookies(
      res,
      {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        accessTtlMs: this.tokenService.accessTtlMs(),
        refreshTtlMs: this.tokenService.refreshTtlMs(),
        sessionId: result.sessionId,
      },
      this.config.cookie,
      req.cookies[CSRF_TOKEN_COOKIE],
    );

    return UserDetailResponseDto.fromDomain(result.user, translate);
  }

  @(endpoint()
    .post('logout')
    .httpCode(HttpStatus.OK)
    .audit('Auth.logout')
    .successMessage('auth.success.logged_out')
    .tags('auth')
    .summary('Revoke all active sessions and clear auth cookies')
    .build())
  async logout(
    @CurrentActor() actor: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<null> {
    await this.logoutUseCase.execute({ userUuid: actor.uuid });

    clearAuthCookies(res, this.config.cookie);

    return null;
  }
}
