import { ConflictError } from './conflict.error';

export class InactiveRecordError extends ConflictError {
  constructor(messageKey = 'errors.inactive', args?: Record<string, unknown>) {
    super(messageKey, args);
  }
}
