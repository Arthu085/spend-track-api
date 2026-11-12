import { STATUS_CODES } from 'http';
import type { ArgumentsHost } from '@nestjs/common';
import type { Request } from 'express';
import type { I18nValidationException } from 'nestjs-i18n';
import type { ValidationErrorResponseBody } from '@shared/presentation/http';

export function buildValidationErrorBody(
  host: ArgumentsHost,
  exception: I18nValidationException,
  messages: object,
): ValidationErrorResponseBody {
  const status = exception.getStatus();
  const request = host.switchToHttp().getRequest<Request>();

  return {
    statusCode: status,
    error: STATUS_CODES[status] ?? 'Bad Request',
    message: messages as string[],
    timestamp: new Date().toISOString(),
    path: request.url,
  };
}
