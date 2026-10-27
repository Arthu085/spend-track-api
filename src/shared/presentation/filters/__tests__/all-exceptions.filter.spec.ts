import { STATUS_CODES } from 'http';
import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import type { AuditLogPort } from '../../../application/ports';
import {
  ConflictError,
  DomainError,
  ForbiddenError,
  InactiveRecordError,
  MissingAbilityError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../../domain/errors';
import { Subject } from '../../../domain/authorization/subject';
import { Action } from '../../../domain/enums/action.enum';
import { AuditOutcome } from '../../../domain/enums/audit-outcome.enum';
import { INTERNAL_AUDIT_ERROR_MESSAGE } from '../../http/describe-audit-error';
import {
  attachAuditContext,
  attachAuditReferenceId,
  markAuditHandled,
  type AuditCapableRequest,
  type AuditContext,
} from '../../metadata/audit-context.type';
import { AllExceptionsFilter } from '../all-exceptions.filter';

interface MockRequest {
  url: string;
  method?: string;
  originalUrl?: string;
  ip?: string;
  headers?: Record<string, string>;
  i18nContext?: { lang: string };
}

describe('AllExceptionsFilter', () => {
  const createI18n = () => {
    const translate = jest.fn((key: string) => `translated:${key}`);
    const service = { translate } as unknown as I18nService;

    return { service, translate };
  };

  const createHost = (requestOverrides: Partial<MockRequest> = {}) => {
    const request: MockRequest = { url: '/api/things', ...requestOverrides };
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });

    const host = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ status }),
        getNext: () => undefined,
      }),
    } as unknown as ArgumentsHost;

    return { host, request, status, json };
  };

  const isoTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

  const domainErrorCases: Array<{
    name: string;
    error: DomainError;
    status: HttpStatus;
  }> = [
    {
      name: 'NotFoundError',
      error: new NotFoundError(),
      status: HttpStatus.NOT_FOUND,
    },
    {
      name: 'ConflictError',
      error: new ConflictError(),
      status: HttpStatus.CONFLICT,
    },
    {
      name: 'InactiveRecordError',
      error: new InactiveRecordError(),
      status: HttpStatus.CONFLICT,
    },
    {
      name: 'ValidationError',
      error: new ValidationError(),
      status: HttpStatus.UNPROCESSABLE_ENTITY,
    },
    {
      name: 'UnauthorizedError',
      error: new UnauthorizedError(),
      status: HttpStatus.UNAUTHORIZED,
    },
    {
      name: 'ForbiddenError',
      error: new ForbiddenError(),
      status: HttpStatus.FORBIDDEN,
    },
  ];

  it.each(domainErrorCases)(
    '$name maps to its documented status and a translated message',
    ({ error, status: expectedStatus }) => {
      const { service, translate } = createI18n();
      const filter = new AllExceptionsFilter(service);
      const { host, request, status, json } = createHost();

      filter.catch(error, host);

      expect(translate).toHaveBeenCalledWith(error.messageKey, {
        args: error.args,
        lang: undefined,
      });
      expect(status).toHaveBeenCalledWith(expectedStatus);
      expect(json).toHaveBeenCalledWith({
        statusCode: expectedStatus,
        error: STATUS_CODES[expectedStatus],
        message: `translated:${error.messageKey}`,
        timestamp: expect.stringMatching(isoTimestamp) as string,
        path: request.url,
      });
    },
  );

  it('resolves the current request language when the i18n context is attached', () => {
    const { service, translate } = createI18n();
    const filter = new AllExceptionsFilter(service);
    const { host } = createHost({ i18nContext: { lang: 'en' } });

    filter.catch(new NotFoundError(), host);

    expect(translate).toHaveBeenCalledWith('errors.not_found', {
      args: undefined,
      lang: 'en',
    });
  });

  it('passes custom message key args through to the translator', () => {
    const { service, translate } = createI18n();
    const filter = new AllExceptionsFilter(service);
    const { host } = createHost();
    const error = new NotFoundError('users.not_found', { id: 'u-1' });

    filter.catch(error, host);

    expect(translate).toHaveBeenCalledWith('users.not_found', {
      args: { id: 'u-1' },
      lang: undefined,
    });
  });

  it('falls back to 500 for a DomainError subtype outside the documented map', () => {
    class UnmappedDomainError extends DomainError {
      constructor() {
        super('unmapped.key');
      }
    }

    const { service, translate } = createI18n();
    const filter = new AllExceptionsFilter(service);
    const { host, status } = createHost();

    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();

    filter.catch(new UnmappedDomainError(), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(translate).toHaveBeenCalledWith('unmapped.key', {
      args: undefined,
      lang: undefined,
    });
    expect(loggerSpy).toHaveBeenCalled();

    loggerSpy.mockRestore();
  });

  it('maps an HttpException via its status and forwards a literal message untranslated', () => {
    const { service, translate } = createI18n();
    const filter = new AllExceptionsFilter(service);
    const { host, status, json } = createHost();

    filter.catch(new NotFoundException('Thing not found'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(translate).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Thing not found',
      }),
    );
  });

  it("localizes Nest's unmatched-route 404 instead of forwarding its raw message", () => {
    const { service, translate } = createI18n();
    const filter = new AllExceptionsFilter(service);

    const { host, status, json } = createHost({
      url: '/api/nope',
      method: 'GET',
      originalUrl: '/api/nope',
    });

    filter.catch(new NotFoundException('Cannot GET /api/nope'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(translate).toHaveBeenCalledWith('errors.route_not_found', {
      lang: undefined,
    });
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.NOT_FOUND,
        message: 'translated:errors.route_not_found',
        path: '/api/nope',
      }),
    );
  });

  it('forwards a NotFoundException literal that only resembles the unmatched-route message', () => {
    const { service, translate } = createI18n();
    const filter = new AllExceptionsFilter(service);

    const { host, json } = createHost({
      url: '/api/nope',
      method: 'GET',
      originalUrl: '/api/nope',
    });

    filter.catch(new NotFoundException('Cannot GET /api/other'), host);

    expect(translate).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Cannot GET /api/other',
      }),
    );
  });

  it('translates an HttpException message that looks like a dotted i18n key', () => {
    const { service, translate } = createI18n();
    const filter = new AllExceptionsFilter(service);
    const { host, json } = createHost();

    filter.catch(new BadRequestException('validation.custom_key'), host);

    expect(translate).toHaveBeenCalledWith('validation.custom_key', {
      lang: undefined,
    });
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'translated:validation.custom_key',
      }),
    );
  });

  it('extracts a bare string response body and forwards it untranslated', () => {
    const { service, translate } = createI18n();
    const filter = new AllExceptionsFilter(service);
    const { host, status, json } = createHost();

    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();

    filter.catch(new HttpException('some message', 500), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(translate).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'some message',
      }),
    );

    loggerSpy.mockRestore();
  });

  it('falls back to the exception message when the response object has no message property', () => {
    const { service, translate } = createI18n();
    const filter = new AllExceptionsFilter(service);
    const { host, status, json } = createHost();

    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();

    filter.catch(new HttpException({ foo: 'bar' }, 500), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(translate).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'Http Exception',
      }),
    );

    loggerSpy.mockRestore();
  });

  it('maps an unknown thrown error to 500, logs it, and never leaks its detail', () => {
    const { service, translate } = createI18n();
    const filter = new AllExceptionsFilter(service);
    const { host, status, json } = createHost();

    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();

    const error = new Error('boom - sensitive stack detail');

    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(translate).toHaveBeenCalledWith('errors.internal_server_error', {
      lang: undefined,
    });
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'translated:errors.internal_server_error',
      }),
    );
    expect(loggerSpy).toHaveBeenCalledWith({
      msg: 'Unhandled exception',
      error: 'boom - sensitive stack detail',
      stack: error.stack,
    });

    loggerSpy.mockRestore();
  });

  it('masks email addresses in the logged stack of an unknown error', () => {
    const { service } = createI18n();
    const filter = new AllExceptionsFilter(service);
    const { host } = createHost();

    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();

    filter.catch(
      new Error('Key (email)=(jane@example.com) already exists.'),
      host,
    );

    const [logged] = loggerSpy.mock.calls[0] as [
      { error: string; stack: string },
    ];

    expect(logged.error).toBe('Key (email)=(j***@example.com) already exists.');
    expect(logged.stack).toContain(
      'Key (email)=(j***@example.com) already exists.',
    );
    expect(JSON.stringify(logged)).not.toContain('jane@example.com');

    loggerSpy.mockRestore();
  });

  it('does not log non-500 outcomes', () => {
    const { service } = createI18n();
    const filter = new AllExceptionsFilter(service);
    const { host } = createHost();

    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();

    filter.catch(new NotFoundError(), host);

    expect(loggerSpy).not.toHaveBeenCalled();

    loggerSpy.mockRestore();
  });

  describe('MissingAbilityError -> requiredAbilities', () => {
    it('includes only the missing abilities, each with translated labels', () => {
      const { service, translate } = createI18n();
      const filter = new AllExceptionsFilter(service);
      const { host, status, json } = createHost();

      const error = new MissingAbilityError([
        { action: Action.READ, subject: Subject.USER },
      ]);

      filter.catch(error, host);

      expect(status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
      expect(json).toHaveBeenCalledWith({
        statusCode: HttpStatus.FORBIDDEN,
        error: STATUS_CODES[HttpStatus.FORBIDDEN],
        message: `translated:${error.messageKey}`,
        timestamp: expect.stringMatching(isoTimestamp) as string,
        path: '/api/things',
        requiredAbilities: [
          {
            action: Action.READ,
            actionLabel: 'translated:enums.action.read',
            subject: Subject.USER,
            subjectLabel: 'translated:authorization.subject_label.user',
          },
        ],
      });
      expect(translate).toHaveBeenCalledWith('enums.action.read', {
        lang: undefined,
      });
      expect(translate).toHaveBeenCalledWith(
        'authorization.subject_label.user',
        { lang: undefined },
      );
    });

    it('threads the resolved request language into the label lookups, not just the message', () => {
      const { service, translate } = createI18n();
      const filter = new AllExceptionsFilter(service);
      const { host, json } = createHost({ i18nContext: { lang: 'en' } });

      filter.catch(
        new MissingAbilityError([
          { action: Action.UPDATE, subject: Subject.ROLE },
        ]),
        host,
      );

      expect(translate).toHaveBeenCalledWith('enums.action.update', {
        lang: 'en',
      });
      expect(translate).toHaveBeenCalledWith(
        'authorization.subject_label.role',
        { lang: 'en' },
      );
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          requiredAbilities: [
            {
              action: Action.UPDATE,
              actionLabel: 'translated:enums.action.update',
              subject: Subject.ROLE,
              subjectLabel: 'translated:authorization.subject_label.role',
            },
          ],
        }),
      );
    });

    it('falls back to the raw action/subject when the translator returns the key unchanged (missing translation)', () => {
      const translate = jest.fn((key: string) => key);
      const service = { translate } as unknown as I18nService;
      const filter = new AllExceptionsFilter(service);
      const { host, json } = createHost();

      filter.catch(
        new MissingAbilityError([
          { action: Action.DELETE, subject: Subject.USER },
        ]),
        host,
      );

      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          requiredAbilities: [
            {
              action: Action.DELETE,
              actionLabel: 'DELETE',
              subject: Subject.USER,
              subjectLabel: 'USER',
            },
          ],
        }),
      );
    });

    it('lists every missing ability when several are provided', () => {
      const { service } = createI18n();
      const filter = new AllExceptionsFilter(service);
      const { host, json } = createHost();

      filter.catch(
        new MissingAbilityError([
          { action: Action.READ, subject: Subject.USER },
          { action: Action.UPDATE, subject: Subject.ROLE },
        ]),
        host,
      );

      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          requiredAbilities: [
            {
              action: Action.READ,
              actionLabel: 'translated:enums.action.read',
              subject: Subject.USER,
              subjectLabel: 'translated:authorization.subject_label.user',
            },
            {
              action: Action.UPDATE,
              actionLabel: 'translated:enums.action.update',
              subject: Subject.ROLE,
              subjectLabel: 'translated:authorization.subject_label.role',
            },
          ],
        }),
      );
    });
  });

  describe('requiredAbilities key absence for every other error type', () => {
    it('never includes requiredAbilities on a plain ForbiddenError (e.g. CSRF/admin-immutable failures)', () => {
      const { service } = createI18n();
      const filter = new AllExceptionsFilter(service);
      const { host, json } = createHost();

      filter.catch(new ForbiddenError(), host);

      const body = (json.mock.calls[0] as [Record<string, unknown>])[0];

      expect('requiredAbilities' in body).toBe(false);
    });

    it('never includes requiredAbilities on a 404 NotFoundError body', () => {
      const { service } = createI18n();
      const filter = new AllExceptionsFilter(service);
      const { host, json } = createHost();

      filter.catch(new NotFoundError(), host);

      const body = (json.mock.calls[0] as [Record<string, unknown>])[0];

      expect(Object.keys(body).sort()).toEqual(
        ['error', 'message', 'path', 'statusCode', 'timestamp'].sort(),
      );
      expect('requiredAbilities' in body).toBe(false);
    });

    it('never includes requiredAbilities on a generic 500 error body', () => {
      const { service } = createI18n();
      const filter = new AllExceptionsFilter(service);
      const { host, json } = createHost();

      const loggerSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();

      filter.catch(new Error('boom'), host);

      const body = (json.mock.calls[0] as [Record<string, unknown>])[0];

      expect(Object.keys(body).sort()).toEqual(
        ['error', 'message', 'path', 'statusCode', 'timestamp'].sort(),
      );
      expect('requiredAbilities' in body).toBe(false);

      loggerSpy.mockRestore();
    });
  });
});

describe('AllExceptionsFilter - audit integration', () => {
  const createI18n = () => {
    const translate = jest.fn((key: string) => `translated:${key}`);
    const service = { translate } as unknown as I18nService;

    return { service, translate };
  };

  const createAuditHost = (
    options: {
      context?: AuditContext;
      handled?: boolean;
      referenceId?: string;
      originalUrl?: string;
    } = {},
  ) => {
    const request: MockRequest = {
      url: options.originalUrl ?? '/api/things/1',
      method: 'DELETE',
      originalUrl: options.originalUrl ?? '/api/things/1',
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest' },
    };

    if (options.context !== undefined) {
      attachAuditContext(
        request as unknown as AuditCapableRequest,
        options.context,
      );
    }

    if (options.handled === true) {
      markAuditHandled(request as unknown as AuditCapableRequest);
    }

    if (options.referenceId !== undefined) {
      attachAuditReferenceId(
        request as unknown as AuditCapableRequest,
        options.referenceId,
      );
    }

    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });

    const getHeader = jest.fn((name: string) =>
      name === 'X-Request-Id' ? 'req-1' : undefined,
    );

    const host = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ status, getHeader }),
        getNext: () => undefined,
      }),
    } as unknown as ArgumentsHost;

    return { host, request, status, json };
  };

  it('emits a FAILURE audit record for a guard-level rejection on an annotated route', () => {
    const { service } = createI18n();
    const record = jest.fn().mockResolvedValue(undefined);
    const auditLog: AuditLogPort = { record };
    const filter = new AllExceptionsFilter(service, auditLog);
    const { host } = createAuditHost({ context: { action: 'Thing.delete' } });

    filter.catch(new ForbiddenException('denied'), host);

    expect(record).toHaveBeenCalledWith({
      uuid: expect.any(String) as string,
      userId: null,
      action: 'Thing.delete',
      method: 'DELETE',
      path: '/api/things/1',
      outcome: AuditOutcome.FAILURE,
      statusCode: HttpStatus.FORBIDDEN,
      context: { ip: '127.0.0.1', userAgent: 'jest', requestId: 'req-1' },
      errorMessage: 'denied',
    });
  });

  it('emits a single FAILURE audit record (unchanged errorMessage shape) for a MissingAbilityError on an annotated route', () => {
    const { service } = createI18n();
    const record = jest.fn().mockResolvedValue(undefined);
    const auditLog: AuditLogPort = { record };
    const filter = new AllExceptionsFilter(service, auditLog);
    const { host } = createAuditHost({ context: { action: 'Thing.delete' } });

    const error = new MissingAbilityError([
      { action: Action.DELETE, subject: Subject.USER },
    ]);

    filter.catch(error, host);

    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith({
      uuid: expect.any(String) as string,
      userId: null,
      action: 'Thing.delete',
      method: 'DELETE',
      path: '/api/things/1',
      outcome: AuditOutcome.FAILURE,
      statusCode: HttpStatus.FORBIDDEN,
      context: { ip: '127.0.0.1', userAgent: 'jest', requestId: 'req-1' },
      errorMessage: error.messageKey,
    });
  });

  it('persists the path without its query string for a guard-level rejection', () => {
    const { service } = createI18n();
    const record = jest.fn().mockResolvedValue(undefined);
    const filter = new AllExceptionsFilter(service, { record });

    const { host } = createAuditHost({
      context: { action: 'Thing.delete' },
      originalUrl:
        '/api/things/1?email=user@example.com&token=super-secret-token',
    });

    filter.catch(new ForbiddenException('denied'), host);

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/things/1',
        context: { ip: '127.0.0.1', userAgent: 'jest', requestId: 'req-1' },
      }),
    );

    const serialized = JSON.stringify(record.mock.calls);

    expect(serialized).not.toContain('user@example.com');
    expect(serialized).not.toContain('super-secret-token');
  });

  it('does not emit an audit record when the interceptor already handled the request', () => {
    const { service } = createI18n();
    const record = jest.fn().mockResolvedValue(undefined);
    const auditLog: AuditLogPort = { record };
    const filter = new AllExceptionsFilter(service, auditLog);

    const { host } = createAuditHost({
      context: { action: 'Thing.delete' },
      handled: true,
    });

    filter.catch(new ForbiddenException('denied'), host);

    expect(record).not.toHaveBeenCalled();
  });

  it('does not emit an audit record when the route carries no audit context', () => {
    const { service } = createI18n();
    const record = jest.fn().mockResolvedValue(undefined);
    const auditLog: AuditLogPort = { record };
    const filter = new AllExceptionsFilter(service, auditLog);
    const { host } = createAuditHost();

    filter.catch(new ForbiddenException('denied'), host);

    expect(record).not.toHaveBeenCalled();
  });

  it('does not throw and simply skips auditing when the port is absent (@Optional())', () => {
    const { service } = createI18n();
    const filter = new AllExceptionsFilter(service);

    const { host, json } = createAuditHost({
      context: { action: 'Thing.delete' },
    });

    expect(() =>
      filter.catch(new ForbiddenException('denied'), host),
    ).not.toThrow();
    expect(json).toHaveBeenCalled();
  });
});

describe('AllExceptionsFilter - internal error reference (auditId)', () => {
  const createI18n = () => {
    const translate = jest.fn((key: string) => `translated:${key}`);
    const service = { translate } as unknown as I18nService;

    return { service, translate };
  };

  const createAuditHost = (
    options: {
      context?: AuditContext;
      handled?: boolean;
      referenceId?: string;
    } = {},
  ) => {
    const request: MockRequest = {
      url: '/api/things/1',
      method: 'DELETE',
      originalUrl: '/api/things/1',
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest' },
    };

    if (options.context !== undefined) {
      attachAuditContext(
        request as unknown as AuditCapableRequest,
        options.context,
      );
    }

    if (options.handled === true) {
      markAuditHandled(request as unknown as AuditCapableRequest);
    }

    if (options.referenceId !== undefined) {
      attachAuditReferenceId(
        request as unknown as AuditCapableRequest,
        options.referenceId,
      );
    }

    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });

    const getHeader = jest.fn((name: string) =>
      name === 'X-Request-Id' ? 'req-1' : undefined,
    );

    const host = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ status, getHeader }),
        getNext: () => undefined,
      }),
    } as unknown as ArgumentsHost;

    return { host, request, status, json };
  };

  const uuidPattern = /^[0-9a-f-]{36}$/i;

  it('denied path: generates and persists an auditId for a raw internal error on an audited route', () => {
    const { service } = createI18n();
    const record = jest.fn().mockResolvedValue(undefined);
    const auditLog: AuditLogPort = { record };
    const filter = new AllExceptionsFilter(service, auditLog);

    const { host, json } = createAuditHost({
      context: { action: 'Thing.delete' },
    });

    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();

    filter.catch(new Error('boom'), host);

    const body = (json.mock.calls[0] as [Record<string, unknown>])[0];

    expect(typeof body.auditId).toBe('string');
    expect(body.auditId as string).toMatch(uuidPattern);
    expect(body.message).toBe(
      'translated:errors.internal_server_error_with_reference',
    );

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ uuid: body.auditId }),
    );

    loggerSpy.mockRestore();
  });

  it('denied path: persists a generic audit message instead of the raw internal error text', () => {
    const { service } = createI18n();
    const record = jest.fn().mockResolvedValue(undefined);
    const auditLog: AuditLogPort = { record };
    const filter = new AllExceptionsFilter(service, auditLog);

    const { host } = createAuditHost({
      context: { action: 'Thing.delete' },
    });

    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();

    filter.catch(
      new Error(
        'insert into "users" ("email") values ($1) - duplicate key value violates unique constraint',
      ),
      host,
    );

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        errorMessage: INTERNAL_AUDIT_ERROR_MESSAGE,
      }),
    );

    loggerSpy.mockRestore();
  });

  it('denied path: persists a generic audit message for a non-Error throw', () => {
    const { service } = createI18n();
    const record = jest.fn().mockResolvedValue(undefined);
    const auditLog: AuditLogPort = { record };
    const filter = new AllExceptionsFilter(service, auditLog);

    const { host } = createAuditHost({
      context: { action: 'Thing.delete' },
    });

    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();

    filter.catch('connection string postgres://admin:secret@db/app', host);

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ errorMessage: INTERNAL_AUDIT_ERROR_MESSAGE }),
    );

    loggerSpy.mockRestore();
  });

  it('handler path: reuses an already-stashed reference and does not call auditLog.record itself', () => {
    const { service } = createI18n();
    const record = jest.fn().mockResolvedValue(undefined);
    const auditLog: AuditLogPort = { record };
    const filter = new AllExceptionsFilter(service, auditLog);

    const { host, json } = createAuditHost({
      context: { action: 'Thing.delete' },
      handled: true,
      referenceId: 'fixed-uuid-value',
    });

    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();

    filter.catch(new Error('boom'), host);

    const body = (json.mock.calls[0] as [Record<string, unknown>])[0];

    expect(body.auditId).toBe('fixed-uuid-value');
    expect(record).not.toHaveBeenCalled();

    loggerSpy.mockRestore();
  });

  it('is absent for a DomainError-based 4xx on an audited route', () => {
    const { service } = createI18n();
    const record = jest.fn().mockResolvedValue(undefined);
    const auditLog: AuditLogPort = { record };
    const filter = new AllExceptionsFilter(service, auditLog);

    const { host, json } = createAuditHost({
      context: { action: 'Thing.delete' },
    });

    filter.catch(new NotFoundError(), host);

    const notFoundBody = (json.mock.calls[0] as [Record<string, unknown>])[0];

    expect('auditId' in notFoundBody).toBe(false);
    expect(notFoundBody.message).toBe('translated:errors.not_found');

    json.mockClear();

    filter.catch(new ConflictError(), host);

    const conflictBody = (json.mock.calls[0] as [Record<string, unknown>])[0];

    expect('auditId' in conflictBody).toBe(false);
    expect(conflictBody.message).toBe('translated:errors.conflict');
  });

  it('is absent for an HttpException, even one resolving to 500, on an audited route', () => {
    const { service } = createI18n();
    const record = jest.fn().mockResolvedValue(undefined);
    const auditLog: AuditLogPort = { record };
    const filter = new AllExceptionsFilter(service, auditLog);

    const { host, json } = createAuditHost({
      context: { action: 'Thing.delete' },
    });

    filter.catch(new NotFoundException('Thing not found'), host);

    const notFoundBody = (json.mock.calls[0] as [Record<string, unknown>])[0];

    expect('auditId' in notFoundBody).toBe(false);
    expect(notFoundBody.message).toBe('Thing not found');

    json.mockClear();

    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();

    filter.catch(new HttpException('some message', 500), host);

    const httpExceptionBody = (
      json.mock.calls[0] as [Record<string, unknown>]
    )[0];

    expect('auditId' in httpExceptionBody).toBe(false);
    expect(httpExceptionBody.message).toBe('some message');

    loggerSpy.mockRestore();
  });

  it('is absent for an internal 500 on an unaudited route', () => {
    const { service } = createI18n();
    const record = jest.fn().mockResolvedValue(undefined);
    const auditLog: AuditLogPort = { record };
    const filter = new AllExceptionsFilter(service, auditLog);
    const { host, json } = createAuditHost();

    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();

    filter.catch(new Error('boom'), host);

    const body = (json.mock.calls[0] as [Record<string, unknown>])[0];

    expect('auditId' in body).toBe(false);
    expect(body.message).toBe('translated:errors.internal_server_error');
    expect(record).not.toHaveBeenCalled();

    loggerSpy.mockRestore();
  });

  it('is absent when the audit port itself is absent, and nothing throws', () => {
    const { service } = createI18n();
    const filter = new AllExceptionsFilter(service);

    const { host, json } = createAuditHost({
      context: { action: 'Thing.delete' },
    });

    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();

    expect(() => filter.catch(new Error('boom'), host)).not.toThrow();

    const body = (json.mock.calls[0] as [Record<string, unknown>])[0];

    expect('auditId' in body).toBe(false);

    loggerSpy.mockRestore();
  });

  it('the internal-500-on-audited-route body carries exactly the expected key set, no leaks', () => {
    const { service } = createI18n();
    const record = jest.fn().mockResolvedValue(undefined);
    const auditLog: AuditLogPort = { record };
    const filter = new AllExceptionsFilter(service, auditLog);

    const { host, json } = createAuditHost({
      context: { action: 'Thing.delete' },
    });

    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();

    filter.catch(new Error('boom'), host);

    const body = (json.mock.calls[0] as [Record<string, unknown>])[0];

    expect(Object.keys(body).sort()).toEqual(
      ['auditId', 'error', 'message', 'path', 'statusCode', 'timestamp'].sort(),
    );

    loggerSpy.mockRestore();
  });
});
