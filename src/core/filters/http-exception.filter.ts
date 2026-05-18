import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { STATUS_CODES } from 'http';
import { Request, Response } from 'express';
import { AppLogger } from '../logger/logger.service';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {}

  private sanitize(
    obj: Record<string, unknown> | null | undefined,
  ): Record<string, unknown> {
    if (!obj || typeof obj !== 'object') return {};
    const sanitized = { ...obj };
    const sensitiveKeys = [
      'password',
      'authorization',
      'token',
      'accesstoken',
      'refreshtoken',
    ];
    for (const key in sanitized) {
      if (sensitiveKeys.includes(key.toLowerCase())) {
        sanitized[key] = '[HIDDEN]';
      } else if (
        typeof sanitized[key] === 'object' &&
        sanitized[key] !== null
      ) {
        sanitized[key] = this.sanitize(
          sanitized[key] as Record<string, unknown>,
        );
      }
    }
    return sanitized;
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();

    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;

    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse = isHttpException ? exception.getResponse() : null;

    let message: string | string[] = 'Erro interno do servidor';

    if (isHttpException) {
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null &&
        'message' in exceptionResponse
      ) {
        message = (exceptionResponse as Record<string, unknown>).message as
          | string
          | string[];
      } else {
        message = exception.message;
      }
    }

    let error = STATUS_CODES[status] ?? 'Internal Server Error';

    if (
      isHttpException &&
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'error' in exceptionResponse
    ) {
      const candidate = (exceptionResponse as Record<string, unknown>).error;
      if (typeof candidate === 'string') {
        error = candidate;
      }
    }

    const messages = Array.isArray(message) ? message : undefined;
    const finalMessage = Array.isArray(message)
      ? message.length > 0
        ? message[0]
        : 'Erro interno do servidor'
      : message;

    const exceptionName =
      exception instanceof Error ? `[${exception.name}] ` : '';

    if (status >= 500) {
      const requestDetails = {
        body: this.sanitize(request.body as Record<string, unknown>),
        query: request.query,
        params: request.params,
        headers: this.sanitize(request.headers as Record<string, unknown>),
        ip: request.ip,
      };

      this.logger.error(
        `${status} - ${request.method} ${request.url} - ${exceptionName}${finalMessage} - Context: ${JSON.stringify(requestDetails)}`,
        exception instanceof Error ? exception.stack : undefined,
        'HttpExceptionFilter',
      );
    } else {
      this.logger.warn(
        `${status} - ${request.method} ${request.url} - ${exceptionName}${finalMessage}`,
        'HttpExceptionFilter',
      );
    }

    const responseBody =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? (exceptionResponse as Record<string, unknown>)
        : {};

    /* eslint-disable @typescript-eslint/no-unused-vars */
    const {
      message: _msg,
      error: _err,
      statusCode: _code,
      ...rest
    } = responseBody;
    /* eslint-enable @typescript-eslint/no-unused-vars */

    const meta = {
      ...rest,
      ...(messages && { messages }),
    };

    response.status(status).json({
      success: false,
      statusCode: status,
      error,
      message: finalMessage,
      path: request.url,
      timestamp: new Date().toISOString(),
      ...(Object.keys(meta).length > 0 && { meta }),
    });
  }
}
