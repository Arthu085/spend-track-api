import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Options } from 'pino-http';
import { buildPinoHttpOptions } from '../pino-options.factory';

const UUID_LIKE_REGEX = /^[0-9a-f-]{36}$/i;

const asPinoHttpOptions = (
  pinoHttp: ReturnType<typeof buildPinoHttpOptions>['pinoHttp'],
): Options => pinoHttp as Options;

const asRequestStub = (headers: Record<string, string>): IncomingMessage =>
  ({ headers }) as unknown as IncomingMessage;

const asResponseStub = (setHeader: jest.Mock): ServerResponse =>
  ({ setHeader }) as unknown as ServerResponse;

describe('buildPinoHttpOptions', () => {
  it('propagates the given level into pinoHttp.level', () => {
    expect(
      asPinoHttpOptions(
        buildPinoHttpOptions({ level: 'debug', pretty: false }).pinoHttp,
      ).level,
    ).toBe('debug');
    expect(
      asPinoHttpOptions(
        buildPinoHttpOptions({ level: 'warn', pretty: false }).pinoHttp,
      ).level,
    ).toBe('warn');
  });

  it('redacts cookie, authorization and set-cookie headers, removing them entirely', () => {
    const { pinoHttp } = buildPinoHttpOptions({ level: 'info', pretty: false });

    const redact = asPinoHttpOptions(pinoHttp).redact;

    if (Array.isArray(redact) || redact === undefined) {
      throw new Error('expected redact to be a redactOptions object');
    }

    expect(redact.paths).toEqual([
      'req.headers.cookie',
      'req.headers.authorization',
      'res.headers["set-cookie"]',
    ]);
    expect(redact.remove).toBe(true);
  });

  it('sets a pino-pretty transport when pretty is true', () => {
    const { pinoHttp } = buildPinoHttpOptions({ level: 'info', pretty: true });

    expect(asPinoHttpOptions(pinoHttp).transport).toEqual({
      target: 'pino-pretty',
      options: {
        singleLine: true,
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    });
  });

  it('leaves the transport undefined when pretty is false', () => {
    const { pinoHttp } = buildPinoHttpOptions({
      level: 'info',
      pretty: false,
    });

    expect(asPinoHttpOptions(pinoHttp).transport).toBeUndefined();
  });

  describe('serializers', () => {
    it('trims the req serializer down to id, method and url', () => {
      const { pinoHttp } = buildPinoHttpOptions({
        level: 'info',
        pretty: false,
      });

      const reqSerializer = asPinoHttpOptions(pinoHttp).serializers?.req;

      expect(
        reqSerializer?.({
          id: 'req-1',
          method: 'GET',
          url: '/probe',
          headers: { cookie: 'access_token=secret' },
        }),
      ).toEqual({ id: 'req-1', method: 'GET', url: '/probe' });
    });

    it('trims the res serializer down to statusCode', () => {
      const { pinoHttp } = buildPinoHttpOptions({
        level: 'info',
        pretty: false,
      });

      const resSerializer = asPinoHttpOptions(pinoHttp).serializers?.res;

      expect(
        resSerializer?.({
          statusCode: 204,
          headers: { 'set-cookie': 'access_token=leaked' },
        }),
      ).toEqual({ statusCode: 204 });
    });
  });

  it('uses the named-wildcard route syntax instead of the legacy "*" default', () => {
    const { forRoutes } = buildPinoHttpOptions({
      level: 'info',
      pretty: false,
    });

    expect(forRoutes).toEqual(['{*path}']);
  });

  describe('genReqId', () => {
    it('reuses the inbound x-request-id header when present', () => {
      const req = asRequestStub({ 'x-request-id': 'existing-id' });
      const res = asResponseStub(jest.fn());

      const { pinoHttp } = buildPinoHttpOptions({
        level: 'info',
        pretty: false,
      });

      const requestId = asPinoHttpOptions(pinoHttp).genReqId?.(req, res);

      expect(requestId).toBe('existing-id');
    });

    it('generates a fresh uuid-like id when no x-request-id header is present', () => {
      const req = asRequestStub({});
      const res = asResponseStub(jest.fn());

      const { pinoHttp } = buildPinoHttpOptions({
        level: 'info',
        pretty: false,
      });

      const genReqId = asPinoHttpOptions(pinoHttp).genReqId;

      const firstId = genReqId?.(req, res) as string;
      const secondId = genReqId?.(req, res) as string;

      expect(firstId).toMatch(UUID_LIKE_REGEX);
      expect(secondId).toMatch(UUID_LIKE_REGEX);
      expect(firstId).not.toBe(secondId);
    });

    it('sets the X-Request-Id response header to the generated id', () => {
      const req = asRequestStub({ 'x-request-id': 'existing-id' });
      const setHeader = jest.fn();
      const res = asResponseStub(setHeader);

      const { pinoHttp } = buildPinoHttpOptions({
        level: 'info',
        pretty: false,
      });

      asPinoHttpOptions(pinoHttp).genReqId?.(req, res);

      expect(setHeader).toHaveBeenCalledWith('X-Request-Id', 'existing-id');
    });

    it('falls back to a generated id when the inbound x-request-id contains unsafe characters', () => {
      const maliciousId = '<script>alert(1)</script>';
      const req = asRequestStub({ 'x-request-id': maliciousId });
      const setHeader = jest.fn();
      const res = asResponseStub(setHeader);

      const { pinoHttp } = buildPinoHttpOptions({
        level: 'info',
        pretty: false,
      });

      const requestId = asPinoHttpOptions(pinoHttp).genReqId?.(req, res);

      expect(requestId).not.toBe(maliciousId);
      expect(requestId).toMatch(UUID_LIKE_REGEX);
      expect(setHeader).toHaveBeenCalledWith('X-Request-Id', requestId);
      expect(setHeader).not.toHaveBeenCalledWith('X-Request-Id', maliciousId);
    });

    it('falls back to a generated id when the inbound x-request-id contains whitespace', () => {
      const maliciousId = 'bad id with spaces';
      const req = asRequestStub({ 'x-request-id': maliciousId });
      const res = asResponseStub(jest.fn());

      const { pinoHttp } = buildPinoHttpOptions({
        level: 'info',
        pretty: false,
      });

      const requestId = asPinoHttpOptions(pinoHttp).genReqId?.(req, res);

      expect(requestId).not.toBe(maliciousId);
      expect(requestId).toMatch(UUID_LIKE_REGEX);
    });

    it('falls back to a generated id when the inbound x-request-id is too long', () => {
      const overlyLongId = 'a'.repeat(101);
      const req = asRequestStub({ 'x-request-id': overlyLongId });
      const res = asResponseStub(jest.fn());

      const { pinoHttp } = buildPinoHttpOptions({
        level: 'info',
        pretty: false,
      });

      const requestId = asPinoHttpOptions(pinoHttp).genReqId?.(req, res);

      expect(requestId).not.toBe(overlyLongId);
      expect(requestId).toMatch(UUID_LIKE_REGEX);
    });
  });
});
