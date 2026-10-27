import { AuditOutcome } from '@shared/domain/enums/audit-outcome.enum';
import { AuditLogContext } from './audit-log-context.type';

export interface CreateAuditLogInput {
  uuid: string;
  userId: string | null;
  action: string;
  method: string;
  path: string;
  outcome: AuditOutcome;
  statusCode: number;
  context: AuditLogContext | null;
  errorMessage: string | null;
  occurredAt: Date;
}

export class AuditLog {
  private constructor(
    readonly uuid: string,
    readonly userId: string | null,
    readonly action: string,
    readonly method: string,
    readonly path: string,
    readonly outcome: AuditOutcome,
    readonly statusCode: number,
    readonly context: AuditLogContext | null,
    readonly errorMessage: string | null,
    readonly occurredAt: Date,
  ) {}

  static create(input: CreateAuditLogInput): AuditLog {
    return new AuditLog(
      input.uuid,
      input.userId,
      input.action,
      input.method,
      input.path,
      input.outcome,
      input.statusCode,
      input.context,
      input.errorMessage,
      input.occurredAt,
    );
  }
}
