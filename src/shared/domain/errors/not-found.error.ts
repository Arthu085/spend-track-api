import { DomainError } from './domain-error';

export class NotFoundError extends DomainError {
  constructor(messageKey = 'errors.not_found', args?: Record<string, unknown>) {
    super(messageKey, args);
  }
}
