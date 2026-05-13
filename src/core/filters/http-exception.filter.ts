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

    if (status >= 500) {
      this.logger.error(
        `${status} - ${request.method} ${request.url} - ${finalMessage}`,
        exception instanceof Error ? exception.stack : undefined,
        'HttpExceptionFilter',
      );
    } else {
      this.logger.warn(
        `${status} - ${request.method} ${request.url} - ${finalMessage}`,
        'HttpExceptionFilter',
      );
    }

    const responseBody =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? (exceptionResponse as Record<string, unknown>)
        : {};

    const rest = { ...responseBody };
    delete rest.message;
    delete rest.error;
    delete rest.statusCode;

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
