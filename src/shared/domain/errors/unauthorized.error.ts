import { DomainError } from './domain-error';

export class UnauthorizedError extends DomainError {
  constructor(
    messageKey = 'errors.unauthorized',
    args?: Record<string, unknown>,
  ) {
    super(messageKey, args);
  }
}
