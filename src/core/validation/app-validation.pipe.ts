import type { ValidationError } from 'class-validator';
import {
  I18nValidationPipe,
  type I18nValidationPipeOptions,
  i18nValidationErrorFactory,
} from 'nestjs-i18n';
import { normalizeValidationErrors } from './normalize-validation-errors';

export class AppValidationPipe extends I18nValidationPipe {
  constructor(options?: I18nValidationPipeOptions) {
    super(options);
    this.exceptionFactory = (errors: ValidationError[]) =>
      i18nValidationErrorFactory(normalizeValidationErrors(errors));
  }
}
