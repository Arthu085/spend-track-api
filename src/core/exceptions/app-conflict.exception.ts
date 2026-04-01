import { ConflictException } from '@nestjs/common';
import { AppConflictExceptionOptions } from './types/app-conflict.exception.types';

export class AppConflictException extends ConflictException {
  constructor(options?: AppConflictExceptionOptions) {
    super(options?.message || 'Conflito de dados.');
  }
}
