import type { Request } from 'express';

const QUERY_OR_FRAGMENT_START = /[?#]/;

export function buildAuditPath(request: Request): string {
  return request.originalUrl.split(QUERY_OR_FRAGMENT_START, 1)[0];
}
