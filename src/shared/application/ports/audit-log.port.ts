import { AuditOutcome } from '../../domain/enums/audit-outcome.enum';

export const AUDIT_LOG_PORT = Symbol('AUDIT_LOG_PORT');

export interface AuditRecordInput {
  uuid: string;
  userId: string | null;
  action: string;
  method: string;
  path: string;
  outcome: AuditOutcome;
  statusCode: number;
  context?: Record<string, unknown> | null;
  errorMessage?: string | null;
}

export interface AuditLogPort {
  record(input: AuditRecordInput): Promise<void>;
}
