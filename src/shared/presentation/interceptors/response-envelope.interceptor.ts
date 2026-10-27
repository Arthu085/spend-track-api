import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { describeError } from '../../application/logging';
import { PaginatedResult } from '../../application/dto';
import type { ResponseEnvelope } from '../http/response-envelope';
import { SUCCESS_MESSAGE_METADATA_KEY } from '../metadata/metadata-keys';

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ResponseEnvelopeInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly i18n: I18nService,
  ) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ResponseEnvelope<unknown>> {
    const key = this.reflector.get<string | undefined>(
      SUCCESS_MESSAGE_METADATA_KEY,
      context.getHandler(),
    );

    const lang = I18nContext.current(context)?.lang;
    const message = this.resolveMessage(key, lang);

    return next
      .handle()
      .pipe(map((result: unknown) => this.wrap(result, message)));
  }

  private wrap(
    result: unknown,
    message: string | undefined,
  ): ResponseEnvelope<unknown> {
    if (result instanceof PaginatedResult) {
      return {
        data: result.items,
        meta: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          ...(message !== undefined ? { message } : {}),
        },
      };
    }

    return {
      data: result ?? null,
      meta: { ...(message !== undefined ? { message } : {}) },
    };
  }

  private resolveMessage(
    key: string | undefined,
    lang: string | undefined,
  ): string | undefined {
    if (key === undefined) {
      return undefined;
    }

    try {
      const translated: string = this.i18n.translate(key, { lang });

      if (translated === key) {
        this.logger.debug(`Missing i18n key for success message: ${key}`);
        return undefined;
      }

      return translated;
    } catch (error) {
      this.logger.warn({
        msg: 'Failed to resolve success message',
        key,
        error: describeError(error),
      });
      return undefined;
    }
  }
}
