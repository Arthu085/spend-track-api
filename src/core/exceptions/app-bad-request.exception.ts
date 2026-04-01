import { BadRequestException } from '@nestjs/common';
import { AppBadRequestExceptionOptions } from './types/app-bad-request.exception.types';

export class AppBadRequestException extends BadRequestException {
  constructor(options?: AppBadRequestExceptionOptions) {
    super(options?.message || 'Requisição inválida.');
  }
}
