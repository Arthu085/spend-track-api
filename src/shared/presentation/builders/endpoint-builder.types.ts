import type {
  CanActivate,
  HttpStatus,
  NestInterceptor,
  PipeTransform,
  Type,
} from '@nestjs/common';
import type { AbilityPair } from '../../domain/authorization/ability-pair.type';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type GuardInput = Type<CanActivate>;

export type InterceptorInput = Type<NestInterceptor>;

export type PipeInput = Type<PipeTransform> | PipeTransform;

export interface SwaggerResponseConfig {
  status?: HttpStatus;
  type?: Type<unknown>;
  paginated?: boolean;
  isArray?: boolean;
  description?: string;
}

export interface SwaggerErrorResponseConfig {
  status: HttpStatus;
  description: string;
}

interface SwaggerBodyConfig {
  dto: Type<unknown>;
  isArray?: boolean;
}

interface SwaggerConfig {
  summary?: string;
  description?: string;
  tags: string[];
  body?: SwaggerBodyConfig;
  responses: SwaggerResponseConfig[];
  errorResponses: SwaggerErrorResponseConfig[];
}

interface MetadataEntry {
  key: string;
  value: unknown;
}

export interface EndpointConfig {
  method: HttpMethod;
  path?: string;
  httpStatus?: HttpStatus;
  guards: GuardInput[];
  interceptors: InterceptorInput[];
  pipes: PipeInput[];
  skipThrottle: boolean;
  abilities: AbilityPair[];
  audit?: string;
  successMessage?: string;
  isPublic: boolean;
  extraDecorators: (MethodDecorator | ClassDecorator)[];
  metadata: MetadataEntry[];
  swagger: SwaggerConfig;
}
