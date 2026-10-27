import type { Request, Response } from 'express';
import { buildAuditRequestContext } from '../build-audit-request-context';

describe('buildAuditRequestContext', () => {
  const request = {
    ip: '127.0.0.1',
    headers: { 'user-agent': 'jest' },
  } as unknown as Request;

  const responseWithHeader = (value: unknown) =>
    ({ getHeader: jest.fn(() => value) }) as unknown as Response;

  it('reads the client ip, user agent, and the X-Request-Id response header', () => {
    const getHeader = jest.fn(() => 'req-1');
    const response = { getHeader } as unknown as Response;

    expect(buildAuditRequestContext(request, response)).toEqual({
      ip: '127.0.0.1',
      userAgent: 'jest',
      requestId: 'req-1',
    });
    expect(getHeader).toHaveBeenCalledWith('X-Request-Id');
  });

  it.each([undefined, 42, ['a', 'b']])(
    'leaves requestId undefined when the header is %p',
    (value) => {
      expect(
        buildAuditRequestContext(request, responseWithHeader(value)).requestId,
      ).toBeUndefined();
    },
  );
});
