import {
  applyDecorators,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Put,
  SetMetadata,
  Type,
  UseGuards,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import {
  ABILITY_METADATA_KEY,
  AUDIT_METADATA_KEY,
  PUBLIC_METADATA_KEY,
  SUCCESS_MESSAGE_METADATA_KEY,
} from '../metadata/metadata-keys';
import type { AbilityPair } from '../../domain/authorization/ability-pair.type';
import type {
  EndpointConfig,
  GuardInput,
  HttpMethod,
  InterceptorInput,
  PipeInput,
} from './endpoint-builder.types';
import { swaggerDecorators } from './endpoint-swagger.decorators';

const ROUTE_DECORATORS: Record<HttpMethod, (path?: string) => MethodDecorator> =
  {
    GET: Get,
    POST: Post,
    PUT: Put,
    PATCH: Patch,
    DELETE: Delete,
  };

export function endpoint(): EndpointBuilder {
  return new EndpointBuilder();
}

export class EndpointBuilder {
  private readonly config: EndpointConfig = {
    method: 'GET',
    guards: [],
    interceptors: [],
    pipes: [],
    skipThrottle: false,
    abilities: [],
    isPublic: false,
    extraDecorators: [],
    metadata: [],
    swagger: {
      tags: [],
      responses: [],
      errorResponses: [],
    },
  };

  get(path?: string): this {
    return this.setRoute('GET', path);
  }

  post(path?: string): this {
    return this.setRoute('POST', path);
  }

  put(path?: string): this {
    return this.setRoute('PUT', path);
  }

  patch(path?: string): this {
    return this.setRoute('PATCH', path);
  }

  delete(path?: string): this {
    return this.setRoute('DELETE', path);
  }

  httpCode(status: HttpStatus): this {
    this.config.httpStatus = status;
    return this;
  }

  guards(...guards: GuardInput[]): this {
    this.config.guards.push(...guards);
    return this;
  }

  interceptors(...interceptors: InterceptorInput[]): this {
    this.config.interceptors.push(...interceptors);
    return this;
  }

  pipes(...pipes: PipeInput[]): this {
    this.config.pipes.push(...pipes);
    return this;
  }

  skipThrottle(): this {
    this.config.skipThrottle = true;
    return this;
  }

  ability(...abilities: AbilityPair[]): this {
    this.config.abilities.push(...abilities);
    return this;
  }

  audit(action: string): this {
    this.config.audit = action;
    return this;
  }

  successMessage(key: string): this {
    this.config.successMessage = key;
    return this;
  }

  public(): this {
    this.config.isPublic = true;
    return this;
  }

  metadata(key: string, value: unknown): this {
    this.config.metadata.push({ key, value });
    return this;
  }

  use(...decorators: (MethodDecorator | ClassDecorator)[]): this {
    this.config.extraDecorators.push(...decorators);
    return this;
  }

  summary(text: string): this {
    this.config.swagger.summary = text;
    return this;
  }

  description(text: string): this {
    this.config.swagger.description = text;
    return this;
  }

  tags(...tags: string[]): this {
    this.config.swagger.tags.push(...tags);
    return this;
  }

  response(
    type: Type<unknown>,
    status?: HttpStatus,
    options?: { isArray?: boolean; description?: string },
  ): this {
    this.config.swagger.responses.push({
      type,
      status,
      isArray: options?.isArray,
      description: options?.description,
    });
    return this;
  }

  paginatedResponse(model: Type<unknown>): this {
    this.config.swagger.responses.push({ type: model, paginated: true });
    return this;
  }

  errorResponse(status: HttpStatus, description: string): this {
    this.config.swagger.errorResponses.push({ status, description });
    return this;
  }

  body(dto: Type<unknown>, options?: { isArray?: boolean }): this {
    this.config.swagger.body = { dto, isArray: options?.isArray };
    return this;
  }

  build(): MethodDecorator {
    return applyDecorators(
      ...this.routeDecorators(),
      ...this.metadataDecorators(),
      ...swaggerDecorators(this.config),
      ...this.config.extraDecorators,
    );
  }

  private routeDecorators(): MethodDecorator[] {
    const { config } = this;
    const decorators = [ROUTE_DECORATORS[config.method](config.path)];

    if (config.httpStatus !== undefined) {
      decorators.push(HttpCode(config.httpStatus));
    }

    if (config.guards.length > 0) {
      decorators.push(UseGuards(...config.guards));
    }

    if (config.interceptors.length > 0) {
      decorators.push(UseInterceptors(...config.interceptors));
    }

    if (config.pipes.length > 0) {
      decorators.push(UsePipes(...config.pipes));
    }

    if (config.skipThrottle) {
      decorators.push(SkipThrottle());
    }

    return decorators;
  }

  private metadataDecorators(): MethodDecorator[] {
    const { config } = this;
    const decorators: MethodDecorator[] = [];

    if (config.abilities.length > 0) {
      decorators.push(SetMetadata(ABILITY_METADATA_KEY, config.abilities));
    }

    if (config.audit !== undefined) {
      decorators.push(SetMetadata(AUDIT_METADATA_KEY, config.audit));
    }

    if (config.successMessage !== undefined) {
      decorators.push(
        SetMetadata(SUCCESS_MESSAGE_METADATA_KEY, config.successMessage),
      );
    }

    if (config.isPublic) {
      decorators.push(SetMetadata(PUBLIC_METADATA_KEY, true));
    }

    return [
      ...decorators,
      ...config.metadata.map(({ key, value }) => SetMetadata(key, value)),
    ];
  }

  private setRoute(method: HttpMethod, path?: string): this {
    this.config.method = method;
    this.config.path = path;
    return this;
  }
}
