export interface AuditLogContext extends Record<string, unknown> {
  ip?: string;
  userAgent?: string;
  requestId?: string;
}
