import { ConflictException } from '@nestjs/common';
import { AppConflictExceptionOptions } from './types/app-conflict.exception.type';

export class AppConflictException extends ConflictException {
  constructor(options?: AppConflictExceptionOptions) {
    super(options?.message || 'Conflito de dados.');
  }
}
