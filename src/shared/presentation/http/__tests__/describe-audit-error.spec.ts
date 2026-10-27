import {
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { NotFoundError } from '../../../domain/errors';
import {
  describeAuditError,
  INTERNAL_AUDIT_ERROR_MESSAGE,
  MAX_AUDIT_ERROR_MESSAGE_LENGTH,
} from '../describe-audit-error';

describe('describeAuditError', () => {
  it('keeps the message key of a DomainError', () => {
    expect(describeAuditError(new NotFoundError('users.not_found'))).toBe(
      'users.not_found',
    );
  });

  it('keeps the message of an HttpException, including a deliberate 5xx', () => {
    expect(describeAuditError(new ConflictException('conflict'))).toBe(
      'conflict',
    );
    expect(
      describeAuditError(new InternalServerErrorException('upstream down')),
    ).toBe('upstream down');
  });

  it('masks email addresses inside an expected error message', () => {
    expect(
      describeAuditError(new ConflictException('jane@example.com is taken')),
    ).toBe('j***@example.com is taken');
  });

  it('truncates an expected error message to the maximum audit length', () => {
    expect(
      describeAuditError(
        new ConflictException('x'.repeat(MAX_AUDIT_ERROR_MESSAGE_LENGTH + 1)),
      ),
    ).toHaveLength(MAX_AUDIT_ERROR_MESSAGE_LENGTH);
  });

  it('replaces an unexpected error with a generic message', () => {
    const error = new Error(
      'duplicate key value violates unique constraint "users_email_key": Key (email)=(jane@example.com)',
    );

    expect(describeAuditError(error)).toBe(INTERNAL_AUDIT_ERROR_MESSAGE);
  });

  it('replaces a non-Error throw with a generic message', () => {
    expect(describeAuditError('raw SQL text')).toBe(
      INTERNAL_AUDIT_ERROR_MESSAGE,
    );
  });
});
