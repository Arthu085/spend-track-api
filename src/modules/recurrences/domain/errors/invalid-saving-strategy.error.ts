import { ValidationError } from '@shared/domain/errors';

export class InvalidSavingStrategyError extends ValidationError {
  constructor() {
    super('recurrences.errors.invalid_saving_strategy');
  }
}
