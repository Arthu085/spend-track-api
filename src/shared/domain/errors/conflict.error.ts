import { DomainError } from './domain-error';

export class ConflictError extends DomainError {
  constructor(messageKey = 'errors.conflict', args?: Record<string, unknown>) {
    super(messageKey, args);
  }
}
