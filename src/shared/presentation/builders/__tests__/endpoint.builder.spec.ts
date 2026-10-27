import 'reflect-metadata';
import type {
  CanActivate,
  NestInterceptor,
  PipeTransform,
} from '@nestjs/common';
import { HttpStatus, Injectable, RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  INTERCEPTORS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  PIPES_METADATA,
} from '@nestjs/common/constants';
import { THROTTLER_SKIP } from '@nestjs/throttler/dist/throttler.constants';
import { DECORATORS, getSchemaPath } from '@nestjs/swagger';
import { Action } from '../../../domain/enums/action.enum';
import { ErrorResponseDto } from '../../dto/error-response.dto';
import { CSRF_HEADER_NAME } from '../../http/csrf-header.constant';
import {
  ABILITY_METADATA_KEY,
  AUDIT_METADATA_KEY,
  PUBLIC_METADATA_KEY,
  SUCCESS_MESSAGE_METADATA_KEY,
} from '../../metadata/metadata-keys';
import type { AbilityPair } from '../../../domain/authorization/ability-pair.type';
import { Subject } from '../../../domain/authorization/subject';
import { endpoint } from '../endpoint.builder';

interface ProbeTarget {
  handler: () => void;
}

function createProbe(decorator: MethodDecorator): ProbeTarget {
  class Probe {
    handler(): void {
      return undefined;
    }
  }

  const descriptor = Object.getOwnPropertyDescriptor(
    Probe.prototype,
    'handler',
  );

  if (descriptor === undefined) {
    throw new Error('Expected a property descriptor for handler');
  }

  decorator(Probe.prototype as object, 'handler', descriptor);

  return Probe.prototype;
}

@Injectable()
class GuardA implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

@Injectable()
class GuardB implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

@Injectable()
class InterceptorA implements NestInterceptor {
  intercept(): never {
    throw new Error('not implemented');
  }
}

@Injectable()
class InterceptorB implements NestInterceptor {
  intercept(): never {
    throw new Error('not implemented');
  }
}

class PipeA implements PipeTransform {
  transform<T>(value: T): T {
    return value;
  }
}

class PipeB implements PipeTransform {
  transform<T>(value: T): T {
    return value;
  }
}

class ResponseDto {
  id!: string;
}

class BodyDto {
  name!: string;
}

interface ApiOperationMetadata {
  summary?: string;
  description?: string;
}

interface ApiResponseEntry {
  type?: unknown;
  description?: string;
  isArray?: boolean;
  schema?: {
    properties: {
      data: { type: string; items: { $ref: string } };
      meta: unknown;
    };
  };
}

interface ApiParameterEntry {
  in: string;
  name?: string;
  type?: unknown;
  required?: boolean;
  isArray?: boolean;
}

describe('EndpointBuilder', () => {
  describe('HTTP verb + path', () => {
    it.each([
      { name: 'get' as const, requestMethod: RequestMethod.GET },
      { name: 'post' as const, requestMethod: RequestMethod.POST },
      { name: 'put' as const, requestMethod: RequestMethod.PUT },
      { name: 'patch' as const, requestMethod: RequestMethod.PATCH },
      { name: 'delete' as const, requestMethod: RequestMethod.DELETE },
    ])(
      '$name() sets the path and RequestMethod metadata',
      ({ name, requestMethod }) => {
        const decorator = endpoint()[name]('probe-path').build();
        const target = createProbe(decorator);

        expect(Reflect.getMetadata(PATH_METADATA, target.handler)).toBe(
          'probe-path',
        );
        expect(Reflect.getMetadata(METHOD_METADATA, target.handler)).toBe(
          requestMethod,
        );
      },
    );

    it('defaults the path to "/" when omitted', () => {
      const decorator = endpoint().get().build();
      const target = createProbe(decorator);

      expect(Reflect.getMetadata(PATH_METADATA, target.handler)).toBe('/');
    });
  });

  describe('.httpCode()', () => {
    it('sets HTTP_CODE_METADATA when called', () => {
      const decorator = endpoint()
        .get()
        .httpCode(HttpStatus.NO_CONTENT)
        .build();

      const target = createProbe(decorator);

      expect(Reflect.getMetadata(HTTP_CODE_METADATA, target.handler)).toBe(
        HttpStatus.NO_CONTENT,
      );
    });

    it('leaves HTTP_CODE_METADATA unset when omitted', () => {
      const decorator = endpoint().get().build();
      const target = createProbe(decorator);

      expect(
        Reflect.getMetadata(HTTP_CODE_METADATA, target.handler),
      ).toBeUndefined();
    });
  });

  describe('.guards()', () => {
    it('sets GUARDS_METADATA to exactly the provided guards', () => {
      const decorator = endpoint().get().guards(GuardA, GuardB).build();
      const target = createProbe(decorator);

      expect(Reflect.getMetadata(GUARDS_METADATA, target.handler)).toEqual([
        GuardA,
        GuardB,
      ]);
    });

    it('accumulates guards across multiple .guards() calls', () => {
      const decorator = endpoint().get().guards(GuardA).guards(GuardB).build();

      const target = createProbe(decorator);

      expect(Reflect.getMetadata(GUARDS_METADATA, target.handler)).toEqual([
        GuardA,
        GuardB,
      ]);
    });

    it('leaves GUARDS_METADATA unset when never called', () => {
      const decorator = endpoint().get().build();
      const target = createProbe(decorator);

      expect(
        Reflect.getMetadata(GUARDS_METADATA, target.handler),
      ).toBeUndefined();
    });
  });

  describe('.interceptors()', () => {
    it('sets INTERCEPTORS_METADATA to exactly the provided interceptors', () => {
      const decorator = endpoint()
        .get()
        .interceptors(InterceptorA, InterceptorB)
        .build();

      const target = createProbe(decorator);

      expect(
        Reflect.getMetadata(INTERCEPTORS_METADATA, target.handler),
      ).toEqual([InterceptorA, InterceptorB]);
    });

    it('accumulates interceptors across multiple .interceptors() calls', () => {
      const decorator = endpoint()
        .get()
        .interceptors(InterceptorA)
        .interceptors(InterceptorB)
        .build();

      const target = createProbe(decorator);

      expect(
        Reflect.getMetadata(INTERCEPTORS_METADATA, target.handler),
      ).toEqual([InterceptorA, InterceptorB]);
    });

    it('leaves INTERCEPTORS_METADATA unset when never called', () => {
      const decorator = endpoint().get().build();
      const target = createProbe(decorator);

      expect(
        Reflect.getMetadata(INTERCEPTORS_METADATA, target.handler),
      ).toBeUndefined();
    });
  });

  describe('.pipes()', () => {
    it('sets PIPES_METADATA to exactly the provided pipes', () => {
      const pipeA = new PipeA();
      const pipeB = new PipeB();
      const decorator = endpoint().get().pipes(pipeA, pipeB).build();
      const target = createProbe(decorator);

      expect(Reflect.getMetadata(PIPES_METADATA, target.handler)).toEqual([
        pipeA,
        pipeB,
      ]);
    });

    it('accumulates pipes across multiple .pipes() calls', () => {
      const pipeA = new PipeA();
      const pipeB = new PipeB();
      const decorator = endpoint().get().pipes(pipeA).pipes(pipeB).build();
      const target = createProbe(decorator);

      expect(Reflect.getMetadata(PIPES_METADATA, target.handler)).toEqual([
        pipeA,
        pipeB,
      ]);
    });

    it('leaves PIPES_METADATA unset when never called', () => {
      const decorator = endpoint().get().build();
      const target = createProbe(decorator);

      expect(
        Reflect.getMetadata(PIPES_METADATA, target.handler),
      ).toBeUndefined();
    });
  });

  describe('.skipThrottle()', () => {
    it('sets the throttler skip metadata when called', () => {
      const decorator = endpoint().get().skipThrottle().build();
      const target = createProbe(decorator);

      expect(
        Reflect.getMetadata(`${THROTTLER_SKIP}default`, target.handler),
      ).toBe(true);
    });

    it('leaves the throttler skip metadata unset when omitted', () => {
      const decorator = endpoint().get().build();
      const target = createProbe(decorator);

      expect(
        Reflect.getMetadata(`${THROTTLER_SKIP}default`, target.handler),
      ).toBeUndefined();
    });
  });

  describe('.ability()', () => {
    const readUser: AbilityPair = {
      action: Action.READ,
      subject: Subject.USER,
    };

    const updateUser: AbilityPair = {
      action: Action.UPDATE,
      subject: Subject.USER,
    };

    it('accumulates abilities across multiple .ability() calls', () => {
      const decorator = endpoint()
        .get()
        .ability(readUser)
        .ability(updateUser)
        .build();

      const target = createProbe(decorator);

      expect(Reflect.getMetadata(ABILITY_METADATA_KEY, target.handler)).toEqual(
        [readUser, updateUser],
      );
    });

    it('accumulates abilities passed as multiple arguments in a single call', () => {
      const decorator = endpoint().get().ability(readUser, updateUser).build();
      const target = createProbe(decorator);

      expect(Reflect.getMetadata(ABILITY_METADATA_KEY, target.handler)).toEqual(
        [readUser, updateUser],
      );
    });

    it('leaves ABILITY_METADATA_KEY unset when never called', () => {
      const decorator = endpoint().get().build();
      const target = createProbe(decorator);

      expect(
        Reflect.getMetadata(ABILITY_METADATA_KEY, target.handler),
      ).toBeUndefined();
    });
  });

  describe('.audit()', () => {
    it('sets AUDIT_METADATA_KEY to the provided action identifier', () => {
      const decorator = endpoint().get().audit('User.read').build();
      const target = createProbe(decorator);

      expect(Reflect.getMetadata(AUDIT_METADATA_KEY, target.handler)).toBe(
        'User.read',
      );
    });

    it('leaves AUDIT_METADATA_KEY unset when omitted', () => {
      const decorator = endpoint().get().build();
      const target = createProbe(decorator);

      expect(
        Reflect.getMetadata(AUDIT_METADATA_KEY, target.handler),
      ).toBeUndefined();
    });
  });

  describe('.successMessage()', () => {
    it('sets SUCCESS_MESSAGE_METADATA_KEY to the provided key', () => {
      const decorator = endpoint()
        .get()
        .successMessage('success.created')
        .build();

      const target = createProbe(decorator);

      expect(
        Reflect.getMetadata(SUCCESS_MESSAGE_METADATA_KEY, target.handler),
      ).toBe('success.created');
    });

    it('leaves SUCCESS_MESSAGE_METADATA_KEY unset when omitted', () => {
      const decorator = endpoint().get().build();
      const target = createProbe(decorator);

      expect(
        Reflect.getMetadata(SUCCESS_MESSAGE_METADATA_KEY, target.handler),
      ).toBeUndefined();
    });
  });

  describe('.public()', () => {
    it('sets PUBLIC_METADATA_KEY to true when called', () => {
      const decorator = endpoint().get().public().build();
      const target = createProbe(decorator);

      expect(Reflect.getMetadata(PUBLIC_METADATA_KEY, target.handler)).toBe(
        true,
      );
    });

    it('leaves PUBLIC_METADATA_KEY unset when never called', () => {
      const decorator = endpoint().get().build();
      const target = createProbe(decorator);

      expect(
        Reflect.getMetadata(PUBLIC_METADATA_KEY, target.handler),
      ).toBeUndefined();
    });
  });

  describe('.metadata()', () => {
    it('sets an arbitrary custom metadata key/value pair', () => {
      const decorator = endpoint()
        .get()
        .metadata('custom:key', 'value')
        .build();

      const target = createProbe(decorator);

      expect(Reflect.getMetadata('custom:key', target.handler)).toBe('value');
    });

    it('lands multiple .metadata() calls with different keys independently', () => {
      const decorator = endpoint()
        .get()
        .metadata('custom:key1', 'v1')
        .metadata('custom:key2', 'v2')
        .build();

      const target = createProbe(decorator);

      expect(Reflect.getMetadata('custom:key1', target.handler)).toBe('v1');
      expect(Reflect.getMetadata('custom:key2', target.handler)).toBe('v2');
    });

    it('leaves untouched custom keys unset', () => {
      const decorator = endpoint().get().build();
      const target = createProbe(decorator);

      expect(
        Reflect.getMetadata('custom:untouched', target.handler),
      ).toBeUndefined();
    });
  });

  describe('.use()', () => {
    it('applies extra decorators, spread last', () => {
      const probeDecorator: MethodDecorator = (_target, _key, descriptor) => {
        Reflect.defineMetadata('probe:used', true, descriptor.value as object);

        return descriptor;
      };

      const decorator = endpoint().get().use(probeDecorator).build();
      const target = createProbe(decorator);

      expect(Reflect.getMetadata('probe:used', target.handler)).toBe(true);
    });
  });

  describe('Swagger metadata', () => {
    it('sets ApiOperation summary/description', () => {
      const decorator = endpoint()
        .get()
        .summary('Does the thing')
        .description('Longer explanation')
        .build();

      const target = createProbe(decorator);

      const operation = Reflect.getMetadata(
        DECORATORS.API_OPERATION,
        target.handler,
      ) as ApiOperationMetadata;

      expect(operation.summary).toBe('Does the thing');
      expect(operation.description).toBe('Longer explanation');
    });

    it('omits ApiOperation metadata entirely when neither summary nor description is set', () => {
      const decorator = endpoint().get().build();
      const target = createProbe(decorator);

      expect(
        Reflect.getMetadata(DECORATORS.API_OPERATION, target.handler),
      ).toBeUndefined();
    });

    it('sets ApiTags, accumulating across multiple .tags() calls', () => {
      const decorator = endpoint().get().tags('health').tags('probe').build();
      const target = createProbe(decorator);

      expect(Reflect.getMetadata(DECORATORS.API_TAGS, target.handler)).toEqual([
        'health',
        'probe',
      ]);
    });

    it('documents the CSRF header for non-GET methods', () => {
      const decorator = endpoint().post().build();
      const target = createProbe(decorator);

      const parameters = Reflect.getMetadata(
        DECORATORS.API_PARAMETERS,
        target.handler,
      ) as ApiParameterEntry[];

      expect(parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            in: 'header',
            name: CSRF_HEADER_NAME,
            required: true,
          }),
        ]),
      );
    });

    it('omits the CSRF header for GET', () => {
      const decorator = endpoint().get().build();
      const target = createProbe(decorator);

      const parameters = Reflect.getMetadata(
        DECORATORS.API_PARAMETERS,
        target.handler,
      ) as ApiParameterEntry[] | undefined;

      expect(
        parameters?.some((parameter) => parameter.name === CSRF_HEADER_NAME),
      ).not.toBe(true);
    });

    it('sets ApiBody metadata for .body()', () => {
      const decorator = endpoint().post().body(BodyDto).build();
      const target = createProbe(decorator);

      const parameters = Reflect.getMetadata(
        DECORATORS.API_PARAMETERS,
        target.handler,
      ) as ApiParameterEntry[];

      expect(parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ in: 'body', type: BodyDto }),
        ]),
      );
    });

    it('sets an ApiResponse entry for .response(type, status)', () => {
      const decorator = endpoint()
        .get()
        .response(ResponseDto, HttpStatus.CREATED)
        .build();

      const target = createProbe(decorator);

      const responses = Reflect.getMetadata(
        DECORATORS.API_RESPONSE,
        target.handler,
      ) as Record<string, ApiResponseEntry>;

      expect(responses[HttpStatus.CREATED]).toBeDefined();
      expect(responses[HttpStatus.CREATED].type).toBe(ResponseDto);
    });

    it('sets ApiBody with isArray for .body(dto, { isArray: true })', () => {
      const decorator = endpoint()
        .post()
        .body(BodyDto, { isArray: true })
        .build();

      const target = createProbe(decorator);

      const parameters = Reflect.getMetadata(
        DECORATORS.API_PARAMETERS,
        target.handler,
      ) as ApiParameterEntry[];

      expect(parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ in: 'body', type: BodyDto, isArray: true }),
        ]),
      );
    });

    it('sets an ApiResponse entry with isArray for .response(type, status, { isArray: true })', () => {
      const decorator = endpoint()
        .get()
        .response(ResponseDto, HttpStatus.OK, { isArray: true })
        .build();

      const target = createProbe(decorator);

      const responses = Reflect.getMetadata(
        DECORATORS.API_RESPONSE,
        target.handler,
      ) as Record<string, ApiResponseEntry>;

      expect(responses[HttpStatus.OK]).toBeDefined();
      expect(responses[HttpStatus.OK].type).toBe(ResponseDto);
      expect(responses[HttpStatus.OK].isArray).toBe(true);
    });

    it('sets an ApiResponse entry with description for .response(type, status, { description })', () => {
      const decorator = endpoint()
        .get()
        .response(ResponseDto, HttpStatus.NOT_FOUND, {
          description: 'The resource was not found',
        })
        .build();

      const target = createProbe(decorator);

      const responses = Reflect.getMetadata(
        DECORATORS.API_RESPONSE,
        target.handler,
      ) as Record<string, ApiResponseEntry>;

      expect(responses[HttpStatus.NOT_FOUND]).toBeDefined();
      expect(responses[HttpStatus.NOT_FOUND].description).toBe(
        'The resource was not found',
      );
    });

    it('sets ApiExtraModels and a 200 enveloped schema for .paginatedResponse(type)', () => {
      const decorator = endpoint().get().paginatedResponse(ResponseDto).build();
      const target = createProbe(decorator);

      const extraModels = Reflect.getMetadata(
        DECORATORS.API_EXTRA_MODELS,
        target.handler,
      ) as unknown[];

      expect(extraModels).toContain(ResponseDto);

      const responses = Reflect.getMetadata(
        DECORATORS.API_RESPONSE,
        target.handler,
      ) as Record<string, ApiResponseEntry>;

      const okResponse = responses[HttpStatus.OK];

      expect(okResponse).toBeDefined();
      expect(okResponse.schema?.properties.data).toEqual({
        type: 'array',
        items: { $ref: getSchemaPath(ResponseDto) },
      });
    });

    it('leaves every Swagger metadata key unset for a bare public, unthrottled endpoint()', () => {
      const decorator = endpoint().get().public().skipThrottle().build();
      const target = createProbe(decorator);

      expect(
        Reflect.getMetadata(DECORATORS.API_OPERATION, target.handler),
      ).toBeUndefined();
      expect(
        Reflect.getMetadata(DECORATORS.API_TAGS, target.handler),
      ).toBeUndefined();
      expect(
        Reflect.getMetadata(DECORATORS.API_PARAMETERS, target.handler),
      ).toBeUndefined();
      expect(
        Reflect.getMetadata(DECORATORS.API_RESPONSE, target.handler),
      ).toBeUndefined();
    });
  });

  describe('error responses', () => {
    function errorResponsesOf(
      decorator: MethodDecorator,
    ): Record<string, ApiResponseEntry> {
      const target = createProbe(decorator);

      return Reflect.getMetadata(
        DECORATORS.API_RESPONSE,
        target.handler,
      ) as Record<string, ApiResponseEntry>;
    }

    it('documents 401, the unconfirmed-email 403, and 429 with ErrorResponseDto for a protected, throttled GET', () => {
      const responses = errorResponsesOf(endpoint().get().build());

      expect(Object.keys(responses).sort()).toEqual(['401', '403', '429']);
      expect(responses[HttpStatus.UNAUTHORIZED].type).toBe(ErrorResponseDto);
      expect(responses[HttpStatus.FORBIDDEN].description).toContain(
        'not confirmed',
      );
      expect(responses[HttpStatus.TOO_MANY_REQUESTS].type).toBe(
        ErrorResponseDto,
      );
    });

    it('omits 401 and the unconfirmed-email 403 for .public() routes', () => {
      const responses = errorResponsesOf(endpoint().get().public().build());

      expect(responses[HttpStatus.UNAUTHORIZED]).toBeUndefined();
      expect(responses[HttpStatus.FORBIDDEN]).toBeUndefined();
    });

    it('omits 429 for .skipThrottle() routes', () => {
      const responses = errorResponsesOf(
        endpoint().get().skipThrottle().build(),
      );

      expect(responses[HttpStatus.TOO_MANY_REQUESTS]).toBeUndefined();
    });

    it('documents a CSRF 403 for non-GET methods', () => {
      const responses = errorResponsesOf(endpoint().post().public().build());

      expect(responses[HttpStatus.FORBIDDEN].description).toContain('CSRF');
    });

    it('documents a missing-ability 403 for .ability() routes', () => {
      const responses = errorResponsesOf(
        endpoint()
          .get()
          .ability({ action: Action.READ, subject: Subject.USER })
          .build(),
      );

      expect(responses[HttpStatus.FORBIDDEN].description).toContain(
        'requiredAbilities',
      );
      expect(responses[HttpStatus.FORBIDDEN].description).not.toContain('CSRF');
    });

    it('merges standard and .errorResponse() descriptions sharing a status', () => {
      const responses = errorResponsesOf(
        endpoint()
          .patch(':uuid')
          .ability({ action: Action.UPDATE, subject: Subject.USER })
          .errorResponse(HttpStatus.FORBIDDEN, 'Self-update forbidden.')
          .build(),
      );

      const forbidden = responses[HttpStatus.FORBIDDEN];

      expect(forbidden.type).toBe(ErrorResponseDto);
      expect(forbidden.description).toMatch(
        /CSRF.*requiredAbilities.*Self-update forbidden\.$/,
      );
    });

    it('documents route-specific statuses declared with .errorResponse()', () => {
      const responses = errorResponsesOf(
        endpoint()
          .get(':uuid')
          .errorResponse(HttpStatus.NOT_FOUND, 'User not found.')
          .errorResponse(HttpStatus.CONFLICT, 'User is inactive.')
          .errorResponse(HttpStatus.CONFLICT, 'Email already in use.')
          .errorResponse(HttpStatus.UNPROCESSABLE_ENTITY, 'Invalid token.')
          .build(),
      );

      expect(responses[HttpStatus.NOT_FOUND]).toMatchObject({
        type: ErrorResponseDto,
        description: 'User not found.',
      });
      expect(responses[HttpStatus.CONFLICT].description).toBe(
        'User is inactive. Email already in use.',
      );
      expect(responses[HttpStatus.UNPROCESSABLE_ENTITY].description).toBe(
        'Invalid token.',
      );
    });

    it('lets an explicit .response() override a standard error status', () => {
      const responses = errorResponsesOf(
        endpoint().get().response(ResponseDto, HttpStatus.UNAUTHORIZED).build(),
      );

      expect(responses[HttpStatus.UNAUTHORIZED].type).toBe(ResponseDto);
    });
  });

  describe('bare endpoint()', () => {
    it('produces no stray metadata for any optional concern', () => {
      const decorator = endpoint().get().build();
      const target = createProbe(decorator);

      expect(
        Reflect.getMetadata(GUARDS_METADATA, target.handler),
      ).toBeUndefined();
      expect(
        Reflect.getMetadata(INTERCEPTORS_METADATA, target.handler),
      ).toBeUndefined();
      expect(
        Reflect.getMetadata(PIPES_METADATA, target.handler),
      ).toBeUndefined();
      expect(
        Reflect.getMetadata(ABILITY_METADATA_KEY, target.handler),
      ).toBeUndefined();
      expect(
        Reflect.getMetadata(AUDIT_METADATA_KEY, target.handler),
      ).toBeUndefined();
      expect(
        Reflect.getMetadata(SUCCESS_MESSAGE_METADATA_KEY, target.handler),
      ).toBeUndefined();
      expect(
        Reflect.getMetadata(PUBLIC_METADATA_KEY, target.handler),
      ).toBeUndefined();
      expect(
        Reflect.getMetadata(HTTP_CODE_METADATA, target.handler),
      ).toBeUndefined();
      expect(
        Reflect.getMetadata(`${THROTTLER_SKIP}default`, target.handler),
      ).toBeUndefined();
    });
  });
});
