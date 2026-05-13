import { UnauthorizedException } from '@nestjs/common';
import { AppUnauthorizedExceptionOptions } from './types/app-unauthorized.exception.type';

export class AppUnauthorizedException extends UnauthorizedException {
  constructor(options?: AppUnauthorizedExceptionOptions) {
    super(options?.message || 'Sem autorização para acessar este recurso.');
  }
}
