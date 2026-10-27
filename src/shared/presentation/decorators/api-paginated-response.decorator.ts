import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';

export function ApiPaginatedResponse(model: Type<unknown>) {
  return applyDecorators(
    ApiExtraModels(model),
    ApiOkResponse({
      schema: {
        properties: {
          data: {
            type: 'array',
            items: { $ref: getSchemaPath(model) },
          },
          meta: {
            type: 'object',
            properties: {
              total: { type: 'number' },
              page: { type: 'number' },
              limit: { type: 'number' },
              message: { type: 'string' },
            },
          },
        },
      },
    }),
  );
}
