import { STATUS_CODES } from 'http';
import { randomUUID } from 'node:crypto';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { I18nContext, I18nService, type TranslateOptions } from 'nestjs-i18n';
import { describeError, redactEmails } from '../../application/logging';
import { AUDIT_LOG_PORT, type AuditLogPort } from '../../application/ports';
import {
  ConflictError,
  DomainError,
  ForbiddenError,
  MissingAbilityError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../domain/errors';
import { AuditOutcome } from '../../domain/enums/audit-outcome.enum';
import { buildAuditPath } from '../http/build-audit-path';
import { buildAuditRequestContext } from '../http/build-audit-request-context';
import { describeAuditError } from '../http/describe-audit-error';
import { translateOrFallback } from '../http/translate-or-fallback';
import type {
  ErrorResponseBody,
  RequiredAbilityView,
} from '../http/error-response.type';
import {
  AUDIT_CONTEXT_KEY,
  AUDIT_HANDLED_KEY,
  attachAuditReferenceId,
  readAuditReferenceId,
  type AuditCapableRequest,
} from '../metadata/audit-context.type';

type DomainErrorConstructor =
  | typeof NotFoundError
  | typeof ConflictError
  | typeof ValidationError
  | typeof UnauthorizedError
  | typeof ForbiddenError;

const DOMAIN_ERROR_STATUS_MAP: ReadonlyArray<
  [DomainErrorConstructor, HttpStatus]
> = [
  [NotFoundError, HttpStatus.NOT_FOUND],
  [ConflictError, HttpStatus.CONFLICT],
  [ValidationError, HttpStatus.UNPROCESSABLE_ENTITY],
  [UnauthorizedError, HttpStatus.UNAUTHORIZED],
  [ForbiddenError, HttpStatus.FORBIDDEN],
];

const I18N_KEY_PATTERN = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/i;

const ROUTE_NOT_FOUND_MESSAGE_KEY = 'errors.route_not_found';

@Injectable()
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(
    private readonly i18n: I18nService,
    @Optional()
    @Inject(AUDIT_LOG_PORT)
    private readonly auditLog?: AuditLogPort,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const httpContext = host.switchToHttp();
    const request = httpContext.getRequest<AuditCapableRequest>();
    const response = httpContext.getResponse<Response>();
    const lang = I18nContext.current(host)?.lang;

    const { status, message, internal } = this.resolve(
      exception,
      request,
      lang,
    );

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error({
        msg: 'Unhandled exception',
        error: describeError(exception),
        stack:
          exception instanceof Error && exception.stack
            ? redactEmails(exception.stack)
            : undefined,
      });
    }

    const requiredAbilities = this.describeRequiredAbilities(exception, lang);
    const auditId = this.resolveAuditReferenceId(request, internal);

    const body: ErrorResponseBody = {
      statusCode: status,
      error: STATUS_CODES[status] ?? 'Internal Server Error',
      message:
        auditId !== undefined
          ? this.translate('errors.internal_server_error_with_reference', {
              lang,
            })
          : message,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(requiredAbilities !== undefined ? { requiredAbilities } : {}),
      ...(auditId !== undefined ? { auditId } : {}),
    };

    response.status(status).json(body);

    this.auditDeniedRequest(request, response, status, exception);
  }

  private auditDeniedRequest(
    request: AuditCapableRequest,
    response: Response,
    status: HttpStatus,
    exception: unknown,
  ): void {
    if (this.auditLog === undefined) {
      return;
    }

    const auditContext = request[AUDIT_CONTEXT_KEY];

    if (auditContext === undefined || request[AUDIT_HANDLED_KEY] === true) {
      return;
    }

    void this.auditLog.record({
      uuid: readAuditReferenceId(request) ?? randomUUID(),
      userId: request.user?.uuid ?? null,
      action: auditContext.action,
      method: request.method,
      path: buildAuditPath(request),
      outcome: AuditOutcome.FAILURE,
      statusCode: status,
      context: buildAuditRequestContext(request, response),
      errorMessage: describeAuditError(exception),
    });
  }

  private resolve(
    exception: unknown,
    request: Request,
    lang: string | undefined,
  ): { status: HttpStatus; message: string; internal: boolean } {
    if (exception instanceof DomainError) {
      return {
        status: this.statusForDomainError(exception),
        message: this.translate(exception.messageKey, {
          args: exception.args,
          lang,
        }),
        internal: false,
      };
    }

    if (this.isUnmatchedRoute(exception, request)) {
      return {
        status: HttpStatus.NOT_FOUND,
        message: this.translate(ROUTE_NOT_FOUND_MESSAGE_KEY, { lang }),
        internal: false,
      };
    }

    if (exception instanceof HttpException) {
      return {
        status: exception.getStatus(),
        message: this.messageForHttpException(exception, lang),
        internal: false,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: this.translate('errors.internal_server_error', { lang }),
      internal: true,
    };
  }

  private resolveAuditReferenceId(
    request: AuditCapableRequest,
    internal: boolean,
  ): string | undefined {
    if (!internal || this.auditLog === undefined) {
      return undefined;
    }

    if (request[AUDIT_CONTEXT_KEY] === undefined) {
      return undefined;
    }

    const existing = readAuditReferenceId(request);

    if (existing !== undefined) {
      return existing;
    }

    if (request[AUDIT_HANDLED_KEY] === true) {
      return undefined;
    }

    const referenceId = randomUUID();
    attachAuditReferenceId(request, referenceId);

    return referenceId;
  }

  private describeRequiredAbilities(
    exception: unknown,
    lang: string | undefined,
  ): RequiredAbilityView[] | undefined {
    if (!(exception instanceof MissingAbilityError)) {
      return undefined;
    }

    const translate = (key: string): string => this.translate(key, { lang });

    return exception.requiredAbilities.map((pair) => ({
      action: pair.action,
      actionLabel: translateOrFallback(
        translate,
        `enums.action.${pair.action.toLowerCase()}`,
        pair.action,
      ),
      subject: pair.subject,
      subjectLabel: translateOrFallback(
        translate,
        `authorization.subject_label.${pair.subject.toLowerCase()}`,
        pair.subject,
      ),
    }));
  }

  private isUnmatchedRoute(exception: unknown, request: Request): boolean {
    return (
      exception instanceof NotFoundException &&
      exception.message === `Cannot ${request.method} ${request.originalUrl}`
    );
  }

  private statusForDomainError(exception: DomainError): HttpStatus {
    const entry = DOMAIN_ERROR_STATUS_MAP.find(
      ([ErrorClass]) => exception instanceof ErrorClass,
    );

    return entry ? entry[1] : HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private messageForHttpException(
    exception: HttpException,
    lang: string | undefined,
  ): string {
    const rawMessage =
      this.extractMessage(exception.getResponse()) ?? exception.message;

    if (I18N_KEY_PATTERN.test(rawMessage)) {
      return this.translate(rawMessage, { lang });
    }

    return rawMessage;
  }

  private translate(key: string, options?: TranslateOptions): string {
    return this.i18n.translate(key, options);
  }

  private extractMessage(response: string | object): string | undefined {
    if (typeof response === 'string') {
      return response;
    }

    if (
      typeof response === 'object' &&
      response !== null &&
      'message' in response &&
      typeof response.message === 'string'
    ) {
      return (response as { message: string }).message;
    }

    return undefined;
  }
}
