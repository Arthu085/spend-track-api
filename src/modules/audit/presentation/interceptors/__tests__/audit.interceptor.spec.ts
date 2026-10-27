import { EventEmitter } from 'node:events';
import {
  ForbiddenException,
  type CallHandler,
  type ExecutionContext,
} from '@nestjs/common';
import { of, throwError } from 'rxjs';
import type { AuditLogPort } from '@shared/application/ports';
import { AuditOutcome } from '@shared/domain/enums/audit-outcome.enum';
import { INTERNAL_AUDIT_ERROR_MESSAGE } from '@shared/presentation/http';
import {
  attachAuditContext,
  AUDIT_HANDLED_KEY,
  readAuditReferenceId,
  type AuditCapableRequest,
} from '@shared/presentation/metadata';
import { AuditInterceptor } from '../audit.interceptor';

interface FakeResponse extends EventEmitter {
  statusCode: number;
  getHeader: jest.Mock;
}

const createResponse = (statusCode: number): FakeResponse => {
  const response = new EventEmitter() as FakeResponse;
  response.statusCode = statusCode;
  response.getHeader = jest.fn().mockReturnValue(undefined);
  return response;
};

const createRequest = (
  overrides: Partial<AuditCapableRequest> = {},
): AuditCapableRequest =>
  ({
    method: 'GET',
    originalUrl: '/api/things',
    headers: {},
    ip: '127.0.0.1',
    ...overrides,
  }) as unknown as AuditCapableRequest;

const createContext = (
  request: AuditCapableRequest,
  response: FakeResponse,
): ExecutionContext =>
  ({
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  }) as unknown as ExecutionContext;

describe('AuditInterceptor', () => {
  it('persists a SUCCESS record with the final status code once the response finishes', () => {
    const record = jest.fn().mockResolvedValue(undefined);
    const auditLog: AuditLogPort = { record };
    const interceptor = new AuditInterceptor(auditLog);

    const request = createRequest({
      method: 'GET',
      originalUrl: '/api/things',
    });

    attachAuditContext(request, { action: 'Thing.read' });

    const response = createResponse(200);
    const context = createContext(request, response);
    const next: CallHandler = { handle: () => of({ id: '1' }) };

    interceptor.intercept(context, next).subscribe();

    expect(record).not.toHaveBeenCalled();

    response.emit('finish');

    expect(record).toHaveBeenCalledWith({
      uuid: expect.any(String) as string,
      userId: null,
      action: 'Thing.read',
      method: 'GET',
      path: '/api/things',
      outcome: AuditOutcome.SUCCESS,
      statusCode: 200,
      context: {
        ip: '127.0.0.1',
        userAgent: undefined,
        requestId: undefined,
      },
      errorMessage: null,
    });
  });

  it('persists a FAILURE record with a generic message for an unexpected error and re-throws the original error', () => {
    const record = jest.fn().mockResolvedValue(undefined);
    const auditLog: AuditLogPort = { record };
    const interceptor = new AuditInterceptor(auditLog);

    const request = createRequest({
      method: 'DELETE',
      originalUrl: '/api/things/1',
    });

    attachAuditContext(request, { action: 'Thing.delete' });

    const response = createResponse(200);
    response.statusCode = 500;
    const context = createContext(request, response);

    const error = new Error(
      'duplicate key value violates unique constraint "users_email_key"',
    );

    const next: CallHandler = { handle: () => throwError(() => error) };

    let caught: unknown;

    interceptor.intercept(context, next).subscribe({
      error: (err: unknown) => {
        caught = err;
      },
    });

    expect(caught).toBe(error);

    response.emit('finish');

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'Thing.delete',
        outcome: AuditOutcome.FAILURE,
        statusCode: 500,
        errorMessage: INTERNAL_AUDIT_ERROR_MESSAGE,
      }),
    );
  });

  it('persists the message of an expected HttpException on a FAILURE record', () => {
    const record = jest.fn().mockResolvedValue(undefined);
    const auditLog: AuditLogPort = { record };
    const interceptor = new AuditInterceptor(auditLog);

    const request = createRequest();
    attachAuditContext(request, { action: 'Thing.read' });

    const response = createResponse(403);
    const context = createContext(request, response);

    const next: CallHandler = {
      handle: () => throwError(() => new ForbiddenException('denied')),
    };

    interceptor.intercept(context, next).subscribe({ error: () => undefined });
    response.emit('finish');

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: AuditOutcome.FAILURE,
        errorMessage: 'denied',
      }),
    );
  });

  it.each([
    ['SUCCESS', () => of({ id: '1' }), 200, AuditOutcome.SUCCESS],
    [
      'FAILURE',
      () => throwError(() => new ForbiddenException('denied')),
      403,
      AuditOutcome.FAILURE,
    ],
  ])(
    'persists the path without its query string on a %s record',
    (_label, handle, statusCode, outcome) => {
      const record = jest.fn().mockResolvedValue(undefined);
      const interceptor = new AuditInterceptor({ record });

      const request = createRequest({
        originalUrl:
          '/api/things?email=user@example.com&token=super-secret-token',
      });

      attachAuditContext(request, { action: 'Thing.read' });

      const response = createResponse(statusCode);
      const context = createContext(request, response);

      interceptor
        .intercept(context, { handle })
        .subscribe({ error: () => undefined });
      response.emit('finish');

      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/api/things', outcome }),
      );

      const serialized = JSON.stringify(record.mock.calls);

      expect(serialized).not.toContain('user@example.com');
      expect(serialized).not.toContain('super-secret-token');
    },
  );

  it('emits nothing and simply proxies the handler when the request has no audit context', () => {
    const record = jest.fn().mockResolvedValue(undefined);
    const auditLog: AuditLogPort = { record };
    const interceptor = new AuditInterceptor(auditLog);
    const handle = jest.fn().mockReturnValue(of({ id: '1' }));
    const next: CallHandler = { handle };

    const request = createRequest();
    const response = createResponse(200);
    const context = createContext(request, response);

    const values: unknown[] = [];
    interceptor
      .intercept(context, next)
      .subscribe((value) => values.push(value));

    expect(values).toEqual([{ id: '1' }]);
    expect(handle).toHaveBeenCalledTimes(1);

    response.emit('finish');

    expect(record).not.toHaveBeenCalled();
  });

  it('sets the handled marker on the request regardless of whether the route is audited', () => {
    const auditedRequest = createRequest();
    attachAuditContext(auditedRequest, { action: 'Thing.read' });

    const unauditedRequest = createRequest();

    const auditLog: AuditLogPort = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    const interceptor = new AuditInterceptor(auditLog);
    const next: CallHandler = { handle: () => of({ id: '1' }) };

    interceptor
      .intercept(createContext(auditedRequest, createResponse(200)), next)
      .subscribe();
    interceptor
      .intercept(createContext(unauditedRequest, createResponse(200)), next)
      .subscribe();

    expect(auditedRequest[AUDIT_HANDLED_KEY]).toBe(true);
    expect(unauditedRequest[AUDIT_HANDLED_KEY]).toBe(true);
  });

  it('does not await the audit port before completing the response pipeline', () => {
    let resolveRecord: () => void = () => {};

    const record = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRecord = resolve;
        }),
    );

    const auditLog: AuditLogPort = { record };
    const interceptor = new AuditInterceptor(auditLog);

    const request = createRequest();
    attachAuditContext(request, { action: 'Thing.read' });

    const response = createResponse(200);
    const context = createContext(request, response);
    const next: CallHandler = { handle: () => of({ id: '1' }) };

    const emitted: unknown[] = [];
    let completed = false;

    interceptor.intercept(context, next).subscribe({
      next: (value) => emitted.push(value),
      complete: () => {
        completed = true;
      },
    });

    // The observable completes synchronously, before `finish` is even emitted
    // and long before the never-yet-resolved `record()` promise settles.
    expect(emitted).toEqual([{ id: '1' }]);
    expect(completed).toBe(true);

    response.emit('finish');

    expect(record).toHaveBeenCalledTimes(1);
    resolveRecord();
  });

  it('bypasses auditing entirely for non-HTTP execution contexts', () => {
    const record = jest.fn().mockResolvedValue(undefined);
    const auditLog: AuditLogPort = { record };
    const interceptor = new AuditInterceptor(auditLog);
    const handle = jest.fn().mockReturnValue(of({ id: '1' }));
    const next: CallHandler = { handle };

    const context = { getType: () => 'rpc' } as unknown as ExecutionContext;

    const values: unknown[] = [];
    interceptor
      .intercept(context, next)
      .subscribe((value) => values.push(value));

    expect(values).toEqual([{ id: '1' }]);
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it('never captures the request body in the audit context', () => {
    const record = jest.fn().mockResolvedValue(undefined);
    const auditLog: AuditLogPort = { record };
    const interceptor = new AuditInterceptor(auditLog);

    const request = createRequest({
      method: 'POST',
      originalUrl: '/api/things',
      body: { name: 'a thing', password: 'secret' },
    });

    attachAuditContext(request, { action: 'Thing.create' });

    const response = createResponse(201);
    const context = createContext(request, response);
    const next: CallHandler = { handle: () => of({ id: '1' }) };

    interceptor.intercept(context, next).subscribe();
    response.emit('finish');

    const [input] = record.mock.calls[0] as [
      { context: Record<string, unknown> },
    ];

    expect(input.context).not.toHaveProperty('payload');
    expect(JSON.stringify(input)).not.toContain('secret');
  });

  it('does nothing when the audit port is absent (@Optional())', () => {
    const interceptor = new AuditInterceptor(undefined);

    const request = createRequest();
    attachAuditContext(request, { action: 'Thing.read' });

    const response = createResponse(200);
    const context = createContext(request, response);
    const next: CallHandler = { handle: () => of({ id: '1' }) };

    expect(() => {
      interceptor.intercept(context, next).subscribe();
      response.emit('finish');
    }).not.toThrow();
  });

  describe('audit reference id (auditId)', () => {
    it('stashes a reference id on the request as soon as the pipeline errors, and persists that same id', () => {
      const record = jest.fn().mockResolvedValue(undefined);
      const auditLog: AuditLogPort = { record };
      const interceptor = new AuditInterceptor(auditLog);

      const request = createRequest({
        method: 'DELETE',
        originalUrl: '/api/things/1',
      });

      attachAuditContext(request, { action: 'Thing.delete' });

      const response = createResponse(500);
      const context = createContext(request, response);
      const error = new Error('boom');
      const next: CallHandler = { handle: () => throwError(() => error) };

      interceptor.intercept(context, next).subscribe({ error: () => {} });

      const stashed = readAuditReferenceId(request);

      expect(typeof stashed).toBe('string');
      expect(stashed).toEqual(expect.any(String));

      response.emit('finish');

      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({ uuid: stashed }),
      );
    });

    it('leaves no reference stashed on success, but still persists a generated uuid via the fallback', () => {
      const record = jest.fn().mockResolvedValue(undefined);
      const auditLog: AuditLogPort = { record };
      const interceptor = new AuditInterceptor(auditLog);

      const request = createRequest();
      attachAuditContext(request, { action: 'Thing.read' });

      const response = createResponse(200);
      const context = createContext(request, response);
      const next: CallHandler = { handle: () => of({ id: '1' }) };

      interceptor.intercept(context, next).subscribe();

      expect(readAuditReferenceId(request)).toBeUndefined();

      response.emit('finish');

      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({ uuid: expect.any(String) as string }),
      );
    });

    it('stashes no reference when the audit port is absent, and the original error still propagates', () => {
      const interceptor = new AuditInterceptor(undefined);

      const request = createRequest({
        method: 'DELETE',
        originalUrl: '/api/things/1',
      });

      attachAuditContext(request, { action: 'Thing.delete' });

      const response = createResponse(500);
      const context = createContext(request, response);
      const error = new Error('boom');
      const next: CallHandler = { handle: () => throwError(() => error) };

      let caught: unknown;

      expect(() => {
        interceptor.intercept(context, next).subscribe({
          error: (err: unknown) => {
            caught = err;
          },
        });
        response.emit('finish');
      }).not.toThrow();

      expect(caught).toBe(error);
      expect(readAuditReferenceId(request)).toBeUndefined();
    });
  });
});
