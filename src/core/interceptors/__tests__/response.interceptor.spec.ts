import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import { ResponseInterceptor } from '../response.interceptor';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';

describe('ResponseInterceptor', () => {
  let interceptor: ResponseInterceptor<unknown>;
  let mockReflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    mockReflector = {
      get: jest.fn(),
      getAll: jest.fn(),
      getAllAndMerge: jest.fn(),
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    interceptor = new ResponseInterceptor(mockReflector);
  });

  const createMockContext = (
    mockResponse: Record<string, unknown>,
    handler?: () => void,
  ): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: jest.fn(),
        getNext: jest.fn(),
      }),
      getHandler: () => handler || jest.fn(),
      getClass: jest.fn(),
      getArgs: jest.fn(),
      getArgByIndex: jest.fn(),
      switchToRpc: jest.fn(),
      switchToWs: jest.fn(),
      getType: jest.fn(),
    } as unknown as ExecutionContext;
  };

  it('should wrap primitive response data', (done) => {
    const mockContext = createMockContext({ statusCode: 200 });
    const next: CallHandler = {
      handle: () => of('Primitivo'),
    };

    mockReflector.get.mockReturnValue('Sucesso');

    interceptor.intercept(mockContext, next).subscribe((result) => {
      expect(result).toMatchObject({
        success: true,
        statusCode: 200,
        message: 'Sucesso',
        data: 'Primitivo',
      });
      done();
    });
  });

  it('should format pagination response if data and meta exist', (done) => {
    const mockContext = createMockContext({ statusCode: 200 });
    const paginatedPayload = {
      data: [{ item: 1 }],
      meta: { total: 1 },
    };
    const next: CallHandler = { handle: () => of(paginatedPayload) };

    interceptor.intercept(mockContext, next).subscribe((result) => {
      expect(result).toMatchObject({
        success: true,
        statusCode: 200,
        data: [{ item: 1 }],
        meta: { total: 1 },
      });
      done();
    });
  });

  it('should override message if pagination total is 0', (done) => {
    const mockContext = createMockContext({ statusCode: 200 });
    const paginatedPayload = {
      data: [],
      meta: { total: 0 },
    };
    const next: CallHandler = { handle: () => of(paginatedPayload) };

    mockReflector.get.mockReturnValue('Custom message');

    interceptor.intercept(mockContext, next).subscribe((result) => {
      expect(result).toMatchObject({
        success: true,
        statusCode: 200,
        message: 'Nenhum dado encontrado com os filtros aplicados',
      });
      done();
    });
  });

  it('should bypass formatting entirely if statusCode is 204', (done) => {
    const mockContext = createMockContext({ statusCode: 204 });
    const next: CallHandler = { handle: () => of(undefined) };

    interceptor.intercept(mockContext, next).subscribe((result) => {
      expect(result).toBeUndefined();
      done();
    });
  });
});
