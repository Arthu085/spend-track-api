import { HttpException } from '@nestjs/common';
import { redactEmails } from '../../application/logging';
import { DomainError } from '../../domain/errors';

export const INTERNAL_AUDIT_ERROR_MESSAGE = 'Internal server error';

export const MAX_AUDIT_ERROR_MESSAGE_LENGTH = 500;

export function describeAuditError(error: unknown): string {
  if (error instanceof DomainError || error instanceof HttpException) {
    return redactEmails(error.message).slice(0, MAX_AUDIT_ERROR_MESSAGE_LENGTH);
  }

  return INTERNAL_AUDIT_ERROR_MESSAGE;
}
