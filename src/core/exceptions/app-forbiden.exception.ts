import { ForbiddenException } from '@nestjs/common';
import { AppForbiddenExceptionOptions } from './types/app-forbiden.exception.type';

export class AppForbiddenException extends ForbiddenException {
  constructor(options?: AppForbiddenExceptionOptions) {
    super({
      message: options?.message || 'Permissões insuficientes',
      ...(options?.missingPermissions && {
        missingPermissions: options.missingPermissions,
      }),
    });
  }
}
