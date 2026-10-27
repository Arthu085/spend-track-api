import { AuditLog } from '../entities/audit-log.entity';

export const AUDIT_LOG_REPOSITORY = Symbol('AUDIT_LOG_REPOSITORY');

export interface AuditLogRepository {
  save(log: AuditLog): Promise<void>;
  deleteCreatedBefore(cutoff: Date, limit: number): Promise<number>;
}
