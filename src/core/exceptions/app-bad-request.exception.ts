import { BadRequestException } from '@nestjs/common';
import { AppBadRequestExceptionOptions } from './types/app-bad-request.exception.type';

export class AppBadRequestException extends BadRequestException {
  constructor(options?: AppBadRequestExceptionOptions) {
    super(options?.message || 'Requisição inválida.');
  }
}
