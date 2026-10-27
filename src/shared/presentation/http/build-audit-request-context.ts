import type { Request, Response } from 'express';

export type AuditRequestContext = {
  ip?: string;
  userAgent?: string;
  requestId?: string;
};

export function buildAuditRequestContext(
  request: Request,
  response: Response,
): AuditRequestContext {
  const rawRequestId = response.getHeader('X-Request-Id');

  return {
    ip: request.ip,
    userAgent: request.headers['user-agent'],
    requestId: typeof rawRequestId === 'string' ? rawRequestId : undefined,
  };
}
