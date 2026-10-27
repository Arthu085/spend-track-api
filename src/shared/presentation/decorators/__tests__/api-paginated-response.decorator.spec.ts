import 'reflect-metadata';
import { ApiProperty, DECORATORS, getSchemaPath } from '@nestjs/swagger';
import { ApiPaginatedResponse } from '../api-paginated-response.decorator';

interface PaginatedResponseSchema {
  properties: {
    data: { type: string; items: { $ref: string } };
    meta: {
      type: string;
      properties: {
        total: { type: string };
        page: { type: string };
        limit: { type: string };
        message: { type: string };
      };
    };
  };
}

class ProbeItemDto {
  @ApiProperty()
  id!: string;
}

class ProbeController {
  @ApiPaginatedResponse(ProbeItemDto)
  list(this: void): void {
    return undefined;
  }
}

describe('ApiPaginatedResponse', () => {
  it('applies without throwing', () => {
    expect(() => {
      class AnotherProbeController {
        @ApiPaginatedResponse(ProbeItemDto)
        list(this: void): void {
          return undefined;
        }
      }

      return AnotherProbeController;
    }).not.toThrow();
  });

  it('registers the model as an extra Swagger schema', () => {
    const extraModels = Reflect.getMetadata(
      DECORATORS.API_EXTRA_MODELS,
      ProbeController.prototype.list,
    ) as unknown[];

    expect(extraModels).toContain(ProbeItemDto);
  });

  it('documents the enveloped 200 response as an array of the model wrapped in data/meta with an optional meta.message', () => {
    const responses = Reflect.getMetadata(
      DECORATORS.API_RESPONSE,
      ProbeController.prototype.list,
    ) as Record<string, { schema: PaginatedResponseSchema }>;

    const okResponse = responses[200];

    expect(okResponse).toBeDefined();
    expect(okResponse.schema).toEqual({
      properties: {
        data: {
          type: 'array',
          items: { $ref: getSchemaPath(ProbeItemDto) },
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
    });
  });
});
