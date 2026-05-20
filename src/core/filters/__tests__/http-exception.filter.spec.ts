jest.mock('../../config/env/helpers/env.helpers', () => ({
  isProduction: false,
  isDevelopment: false,
  isTest: true,
  isLoggingEnabled: false,
  isLocalhost: true,
}));

import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import { HttpExceptionFilter } from '../http-exception.filter';
import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { DomainRuleViolationException } from '../../domain/exceptions/domain-rule-violation.exception';
import { DomainConflictException } from '../../domain/exceptions/domain-conflict.exception';
import { Request, Response } from 'express';

jest.mock('../../logger/logger.service');
import { AppLogger } from '../../logger/logger.service';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockLogger: jest.Mocked<AppLogger>;

  beforeEach(() => {
    mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      log: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    } as unknown as jest.Mocked<AppLogger>;
    filter = new HttpExceptionFilter(mockLogger);
  });

  const createMockHost = (
    mockResponse: Partial<Response>,
    mockRequest: Partial<Request> = {},
  ): ArgumentsHost => {
    return {
      switchToHttp: () => ({
        getResponse: () => mockResponse as Response,
        getRequest: () => mockRequest as Request,
        getNext: jest.fn(),
      }),
      getArgs: jest.fn(),
      getArgByIndex: jest.fn(),
      switchToRpc: jest.fn(),
      switchToWs: jest.fn(),
      getType: jest.fn(),
    } as unknown as ArgumentsHost;
  };

  it('should format HttpException payload correctly', () => {
    const mockJson = jest.fn();
    const mockStatus = jest
      .fn()
      .mockReturnValue({ json: mockJson }) as unknown as (
      code: number,
    ) => Response;
    const host = createMockHost(
      { status: mockStatus },
      { url: '/test', method: 'GET' },
    );

    const exception = new HttpException(
      { message: 'Custom error', error: 'Bad Request', extraMeta: 'metadata' },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, host);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockJson).toHaveBeenCalledWith({
      success: false,
      statusCode: HttpStatus.BAD_REQUEST,
      error: 'Bad Request',
      message: 'Custom error',
      path: '/test',
      timestamp: expect.any(String),
      meta: {
        extraMeta: 'metadata',
      },
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Custom error'),
      'HttpExceptionFilter',
    );
  });

  it('should handle internal server errors and format standard message', () => {
    const mockJson = jest.fn();
    const mockStatus = jest
      .fn()
      .mockReturnValue({ json: mockJson }) as unknown as (
      code: number,
    ) => Response;
    const host = createMockHost(
      { status: mockStatus },
      { url: '/test', method: 'GET' },
    );

    const exception = new Error('Unknown breakdown');
    exception.name = 'QueryFailedError';

    filter.catch(exception, host);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockJson).toHaveBeenCalledWith({
      success: false,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'Erro interno do servidor',
      path: '/test',
      timestamp: expect.any(String),
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('[QueryFailedError] Erro interno do servidor'),
      expect.any(String),
      'HttpExceptionFilter',
    );
  });

  it('should map DomainRuleViolationException to 400', () => {
    const mockJson = jest.fn();
    const mockStatus = jest
      .fn()
      .mockReturnValue({ json: mockJson }) as unknown as (
      code: number,
    ) => Response;
    const host = createMockHost(
      { status: mockStatus },
      { url: '/test', method: 'PATCH' },
    );

    const exception = new DomainRuleViolationException('Usuário está inativo');

    filter.catch(exception, host);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockJson).toHaveBeenCalledWith({
      success: false,
      statusCode: HttpStatus.BAD_REQUEST,
      error: 'Bad Request',
      message: 'Usuário está inativo',
      path: '/test',
      timestamp: expect.any(String),
    });
  });

  it('should map DomainConflictException to 409', () => {
    const mockJson = jest.fn();
    const mockStatus = jest
      .fn()
      .mockReturnValue({ json: mockJson }) as unknown as (
      code: number,
    ) => Response;
    const host = createMockHost(
      { status: mockStatus },
      { url: '/test', method: 'PATCH' },
    );

    const exception = new DomainConflictException('Conflito de domínio');

    filter.catch(exception, host);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(mockJson).toHaveBeenCalledWith({
      success: false,
      statusCode: HttpStatus.CONFLICT,
      error: 'Conflict',
      message: 'Conflito de domínio',
      path: '/test',
      timestamp: expect.any(String),
    });
  });

  it('should extract generic arrays of strings to meta.messages', () => {
    const mockJson = jest.fn();
    const mockStatus = jest
      .fn()
      .mockReturnValue({ json: mockJson }) as unknown as (
      code: number,
    ) => Response;
    const host = createMockHost({ status: mockStatus }, { url: '/test-url' });

    const exception = new HttpException(
      { message: ['msg1', 'msg2'], error: 'Bad Request' },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, host);

    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'msg1',
        meta: {
          messages: ['msg1', 'msg2'],
        },
      }),
    );
  });
});
