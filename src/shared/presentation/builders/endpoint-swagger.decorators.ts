import { HttpStatus } from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiPaginatedResponse } from '../decorators/api-paginated-response.decorator';
import { ErrorResponseDto } from '../dto/error-response.dto';
import { CSRF_HEADER_NAME } from '../http/csrf-header.constant';
import type {
  EndpointConfig,
  SwaggerErrorResponseConfig,
  SwaggerResponseConfig,
} from './endpoint-builder.types';

interface StandardErrorResponse extends SwaggerErrorResponseConfig {
  appliesTo: (config: EndpointConfig) => boolean;
}

const STANDARD_ERROR_RESPONSES: StandardErrorResponse[] = [
  {
    status: HttpStatus.UNAUTHORIZED,
    description: 'The access token cookie is missing, invalid, or expired.',
    appliesTo: (config) => !config.isPublic,
  },
  {
    status: HttpStatus.FORBIDDEN,
    description: "The signed-in user's email is not confirmed.",
    appliesTo: (config) => !config.isPublic,
  },
  {
    status: HttpStatus.FORBIDDEN,
    description: 'The CSRF token is missing or invalid.',
    appliesTo: (config) => config.method !== 'GET',
  },
  {
    status: HttpStatus.FORBIDDEN,
    description:
      'The actor lacks a required ability; `requiredAbilities` lists the missing pairs.',
    appliesTo: (config) => config.abilities.length > 0,
  },
  {
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Too many requests; retry after the rate-limit window.',
    appliesTo: (config) => !config.skipThrottle,
  },
];

const CSRF_HEADER_DESCRIPTION =
  'Double-submit CSRF token. Must match the csrf_token cookie ' +
  'issued by GET /auth/csrf, which also returns it as ' +
  'data.csrfToken.';

export function swaggerDecorators(config: EndpointConfig): MethodDecorator[] {
  const { swagger } = config;
  const decorators: MethodDecorator[] = [];

  if (swagger.summary !== undefined || swagger.description !== undefined) {
    decorators.push(
      ApiOperation({
        summary: swagger.summary,
        description: swagger.description,
      }),
    );
  }

  if (swagger.tags.length > 0) {
    decorators.push(ApiTags(...swagger.tags));
  }

  if (config.method !== 'GET') {
    decorators.push(
      ApiHeader({
        name: CSRF_HEADER_NAME,
        required: true,
        description: CSRF_HEADER_DESCRIPTION,
      }),
    );
  }

  if (swagger.body !== undefined) {
    decorators.push(
      ApiBody({ type: swagger.body.dto, isArray: swagger.body.isArray }),
    );
  }

  return [
    ...decorators,
    ...errorResponseDecorators(config),
    ...swagger.responses.map(responseDecorator),
  ];
}

function errorResponseDecorators(config: EndpointConfig): MethodDecorator[] {
  const responses = [
    ...STANDARD_ERROR_RESPONSES.filter(({ appliesTo }) => appliesTo(config)),
    ...config.swagger.errorResponses,
  ];

  const descriptionsByStatus = new Map<HttpStatus, string[]>();

  for (const { status, description } of responses) {
    descriptionsByStatus.set(status, [
      ...(descriptionsByStatus.get(status) ?? []),
      description,
    ]);
  }

  return [...descriptionsByStatus].map(([status, descriptions]) =>
    ApiResponse({
      status,
      type: ErrorResponseDto,
      description: descriptions.join(' '),
    }),
  );
}

function responseDecorator(response: SwaggerResponseConfig): MethodDecorator {
  if (response.paginated && response.type !== undefined) {
    return ApiPaginatedResponse(response.type);
  }

  return ApiResponse({
    status: response.status,
    type: response.type,
    isArray: response.isArray,
    description: response.description,
  });
}
