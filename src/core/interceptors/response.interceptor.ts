import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RESPONSE_MESSAGE_KEY } from '../decorators/response-message.decorator';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, any> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const responseMessage =
      this.reflector.get<string>(RESPONSE_MESSAGE_KEY, context.getHandler()) ||
      'Operação realizada com sucesso';

    const ctx = context.switchToHttp();
    const response = ctx.getResponse();

    return next.handle().pipe(
      map((data: any) => {
        const statusCode = response.statusCode;

        const message = this.getResponseMessage(data, responseMessage);

        const isPaginated = data?.meta && data?.data;

        return {
          success: true,
          statusCode,
          message,
          ...(isPaginated
            ? {
                data: data.data,
                meta: data.meta,
              }
            : {
                data: data ?? null,
              }),
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }

  private getResponseMessage(data: any, defaultMessage: string): string {
    if (data?.meta?.total === 0) {
      return 'Nenhum dado encontrado com os filtros aplicados';
    }

    return defaultMessage;
  }
}
