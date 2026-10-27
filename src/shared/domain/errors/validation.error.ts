import { DomainError } from './domain-error';

export class ValidationError extends DomainError {
  constructor(
    messageKey = 'errors.unprocessable_entity',
    args?: Record<string, unknown>,
  ) {
    super(messageKey, args);
  }
}
