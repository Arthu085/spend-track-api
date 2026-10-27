import { randomUUID } from 'node:crypto';
import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
  Optional,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { AUDIT_LOG_PORT, type AuditLogPort } from '@shared/application/ports';
import { AuditOutcome } from '@shared/domain/enums/audit-outcome.enum';
import {
  buildAuditPath,
  buildAuditRequestContext,
  describeAuditError,
} from '@shared/presentation/http';
import {
  AUDIT_CONTEXT_KEY,
  attachAuditReferenceId,
  markAuditHandled,
  readAuditActorId,
  readAuditReferenceId,
  type AuditCapableRequest,
} from '@shared/presentation/metadata';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    @Optional()
    @Inject(AUDIT_LOG_PORT)
    private readonly auditLog: AuditLogPort | undefined,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<AuditCapableRequest>();
    const response = httpContext.getResponse<Response>();

    markAuditHandled(request);

    const auditContext = request[AUDIT_CONTEXT_KEY];

    if (auditContext === undefined) {
      return next.handle();
    }

    let outcome = AuditOutcome.SUCCESS;
    let errorMessage: string | null = null;

    response.once('finish', () => {
      void this.persist(request, response, auditContext.action, {
        outcome,
        errorMessage,
      });
    });

    return next.handle().pipe(
      tap(() => {
        outcome = AuditOutcome.SUCCESS;
      }),
      catchError((error: unknown) => {
        outcome = AuditOutcome.FAILURE;
        errorMessage = describeAuditError(error);
        if (
          this.auditLog !== undefined &&
          readAuditReferenceId(request) === undefined
        ) {
          attachAuditReferenceId(request, randomUUID());
        }

        throw error;
      }),
    );
  }

  private async persist(
    request: AuditCapableRequest,
    response: Response,
    action: string,
    result: { outcome: AuditOutcome; errorMessage: string | null },
  ): Promise<void> {
    if (this.auditLog === undefined) {
      return;
    }

    await this.auditLog.record({
      uuid: readAuditReferenceId(request) ?? randomUUID(),
      userId: readAuditActorId(request) ?? request.user?.uuid ?? null,
      action,
      method: request.method,
      path: buildAuditPath(request),
      outcome: result.outcome,
      statusCode: response.statusCode,
      context: buildAuditRequestContext(request, response),
      errorMessage: result.errorMessage,
    });
  }
}
