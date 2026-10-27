import { DomainError } from '../domain-error';
import { NotFoundError } from '../not-found.error';
import { ConflictError } from '../conflict.error';
import { InactiveRecordError } from '../inactive-record.error';
import { ValidationError } from '../validation.error';
import { UnauthorizedError } from '../unauthorized.error';
import { ForbiddenError } from '../forbidden.error';

describe('DomainError subclasses', () => {
  const cases: Array<{
    name: string;
    ErrorClass: new (
      messageKey?: string,
      args?: Record<string, unknown>,
    ) => DomainError;
    defaultMessageKey: string;
  }> = [
    {
      name: 'NotFoundError',
      ErrorClass: NotFoundError,
      defaultMessageKey: 'errors.not_found',
    },
    {
      name: 'ConflictError',
      ErrorClass: ConflictError,
      defaultMessageKey: 'errors.conflict',
    },
    {
      name: 'InactiveRecordError',
      ErrorClass: InactiveRecordError,
      defaultMessageKey: 'errors.inactive',
    },
    {
      name: 'ValidationError',
      ErrorClass: ValidationError,
      defaultMessageKey: 'errors.unprocessable_entity',
    },
    {
      name: 'UnauthorizedError',
      ErrorClass: UnauthorizedError,
      defaultMessageKey: 'errors.unauthorized',
    },
    {
      name: 'ForbiddenError',
      ErrorClass: ForbiddenError,
      defaultMessageKey: 'errors.forbidden',
    },
  ];

  it.each(cases)(
    '$name is both a DomainError and an Error',
    ({ ErrorClass }) => {
      const error = new ErrorClass();

      expect(error).toBeInstanceOf(DomainError);
      expect(error).toBeInstanceOf(Error);
    },
  );

  it.each(cases)(
    '$name defaults to its documented message key',
    ({ ErrorClass, defaultMessageKey }) => {
      const error = new ErrorClass();

      expect(error.messageKey).toBe(defaultMessageKey);
      expect(error.args).toBeUndefined();
    },
  );

  it.each(cases)('$name carries its class name', ({ ErrorClass, name }) => {
    const error = new ErrorClass();

    expect(error.name).toBe(name);
  });

  it.each(cases)(
    '$name honors a custom message key and args',
    ({ ErrorClass }) => {
      const args = { id: 'abc-123' };
      const error = new ErrorClass('custom.message_key', args);

      expect(error.messageKey).toBe('custom.message_key');
      expect(error.args).toEqual(args);
    },
  );

  it('InactiveRecordError is also a ConflictError (409 mapping)', () => {
    const error = new InactiveRecordError();

    expect(error).toBeInstanceOf(InactiveRecordError);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error).toBeInstanceOf(DomainError);
  });
});
