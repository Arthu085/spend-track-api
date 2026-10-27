import type { Request } from 'express';
import { buildAuditPath } from '../build-audit-path';

describe('buildAuditPath', () => {
  const requestFor = (originalUrl: string) =>
    ({ originalUrl }) as unknown as Request;

  it.each([
    ['/api/things', '/api/things'],
    ['/api/things/1', '/api/things/1'],
    ['/api/things?email=user@example.com', '/api/things'],
    ['/api/auth/confirm?token=secret&lang=en', '/api/auth/confirm'],
    ['/api/things?', '/api/things'],
    ['/api/things#token=secret', '/api/things'],
    ['/api/things?a=1#b', '/api/things'],
    ['/api/things/%20encoded?x=1', '/api/things/%20encoded'],
  ])('maps %p to %p', (originalUrl, expected) => {
    expect(buildAuditPath(requestFor(originalUrl))).toBe(expected);
  });
});
