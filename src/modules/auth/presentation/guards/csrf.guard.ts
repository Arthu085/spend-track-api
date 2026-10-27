import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AppConfigService } from '@core/config';
import { ForbiddenError } from '@shared/domain/errors';
import { CSRF_HEADER_NAME } from '@shared/presentation/http';
import { CSRF_TOKEN_COOKIE } from '../http/auth-cookie.constants';
import { CsrfSessionResolver } from '../http/csrf-session.resolver';
import { constantTimeEquals, isCsrfTokenBoundTo } from '../http/csrf-token';

const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly config: AppConfigService,
    private readonly csrfSessionResolver: CsrfSessionResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();

    if (SAFE_METHODS.has(request.method)) {
      return true;
    }

    if (!(await this.isValid(request))) {
      throw new ForbiddenError('auth.errors.invalid_csrf_token');
    }

    return true;
  }

  private async isValid(request: Request): Promise<boolean> {
    const cookieToken: unknown = request.cookies[CSRF_TOKEN_COOKIE];
    const headerToken: unknown = request.headers[CSRF_HEADER_NAME];

    if (
      typeof cookieToken !== 'string' ||
      typeof headerToken !== 'string' ||
      !constantTimeEquals(cookieToken, headerToken)
    ) {
      return false;
    }

    const sessionId = await this.csrfSessionResolver.resolve(request);

    return (
      sessionId !== null &&
      isCsrfTokenBoundTo(cookieToken, sessionId, this.config.cookie.secret)
    );
  }
}
