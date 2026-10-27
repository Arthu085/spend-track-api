import { DomainError } from './domain-error';

export class ForbiddenError extends DomainError {
  constructor(messageKey = 'errors.forbidden', args?: Record<string, unknown>) {
    super(messageKey, args);
  }
}
