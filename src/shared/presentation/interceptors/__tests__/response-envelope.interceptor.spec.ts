import {
  Logger,
  type CallHandler,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { firstValueFrom, of } from 'rxjs';
import { PaginatedResult } from '../../../application/dto';
import { SUCCESS_MESSAGE_METADATA_KEY } from '../../metadata/metadata-keys';
import { ResponseEnvelopeInterceptor } from '../response-envelope.interceptor';

describe('ResponseEnvelopeInterceptor', () => {
  const createReflector = (key: string | undefined) => {
    const get = jest.fn().mockReturnValue(key);
    const reflector = { get } as unknown as Reflector;

    return { reflector, get };
  };

  const createI18n = (translateImpl: (key: string) => string) => {
    const translate = jest.fn(translateImpl);
    const service = { translate } as unknown as I18nService;

    return { service, translate };
  };

  const context = {
    getHandler: () => (): void => undefined,
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({}) }),
  } as unknown as ExecutionContext;

  const handlerReturning = (result: unknown): CallHandler =>
    ({ handle: () => of(result) }) as CallHandler;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('existing envelope behavior (no success message metadata)', () => {
    const { reflector } = createReflector(undefined);
    const { service, translate } = createI18n((key) => `translated:${key}`);
    const interceptor = new ResponseEnvelopeInterceptor(reflector, service);

    const wrap = (result: unknown) =>
      firstValueFrom(interceptor.intercept(context, handlerReturning(result)));

    it('wraps a plain object in the data/meta envelope', async () => {
      const payload = { id: 1, name: 'foo' };

      await expect(wrap(payload)).resolves.toEqual({ data: payload, meta: {} });
    });

    it('wraps an array as the data payload', async () => {
      const payload = [1, 2, 3];

      await expect(wrap(payload)).resolves.toEqual({ data: payload, meta: {} });
    });

    it('wraps a primitive string', async () => {
      await expect(wrap('hello')).resolves.toEqual({ data: 'hello', meta: {} });
    });

    it('wraps a primitive number', async () => {
      await expect(wrap(42)).resolves.toEqual({ data: 42, meta: {} });
    });

    it('normalizes null to a null data payload', async () => {
      await expect(wrap(null)).resolves.toEqual({ data: null, meta: {} });
    });

    it('normalizes undefined to a null data payload', async () => {
      await expect(wrap(undefined)).resolves.toEqual({ data: null, meta: {} });
    });

    it('unpacks a PaginatedResult into data/meta', async () => {
      const paginated = PaginatedResult.of(['a', 'b'], 2, 1, 20);

      await expect(wrap(paginated)).resolves.toEqual({
        data: ['a', 'b'],
        meta: { total: 2, page: 1, limit: 20 },
      });
    });

    it('never invokes the translator when no success-message metadata is present', async () => {
      await wrap({ id: 1 });

      expect(translate).not.toHaveBeenCalled();
    });
  });

  describe('success message resolution', () => {
    it('sets meta.message for a plain result when the key resolves', async () => {
      const { reflector, get } = createReflector('success.created');
      const { service, translate } = createI18n(() => 'Successfully created');
      const interceptor = new ResponseEnvelopeInterceptor(reflector, service);

      const payload = { id: 1 };

      const result = await firstValueFrom(
        interceptor.intercept(context, handlerReturning(payload)),
      );

      expect(get).toHaveBeenCalledWith(
        SUCCESS_MESSAGE_METADATA_KEY,
        expect.any(Function),
      );
      expect(translate).toHaveBeenCalled();
      expect(result).toEqual({
        data: payload,
        meta: { message: 'Successfully created' },
      });
    });

    it('sets meta.message alongside total/page/limit for a PaginatedResult when the key resolves', async () => {
      const { reflector } = createReflector('success.ok');
      const { service } = createI18n(() => 'Operation completed successfully');
      const interceptor = new ResponseEnvelopeInterceptor(reflector, service);

      const paginated = PaginatedResult.of(['a', 'b'], 2, 1, 20);

      const result = await firstValueFrom(
        interceptor.intercept(context, handlerReturning(paginated)),
      );

      expect(result).toEqual({
        data: ['a', 'b'],
        meta: {
          total: 2,
          page: 1,
          limit: 20,
          message: 'Operation completed successfully',
        },
      });
    });

    it('omits meta.message when the key does not resolve (translate returns the key verbatim)', async () => {
      const { reflector } = createReflector('success.nonexistent_key');
      const { service, translate } = createI18n((key) => key);
      const interceptor = new ResponseEnvelopeInterceptor(reflector, service);

      const payload = { id: 1 };

      const result = await firstValueFrom(
        interceptor.intercept(context, handlerReturning(payload)),
      );

      expect(translate).toHaveBeenCalled();
      expect(result).toEqual({ data: payload, meta: {} });
    });

    it('omits meta.message and swallows the error when translate throws', async () => {
      const { reflector } = createReflector('success.created');

      const translate = jest.fn(() => {
        throw new Error('translation backend unavailable');
      });

      const service = { translate } as unknown as I18nService;
      const interceptor = new ResponseEnvelopeInterceptor(reflector, service);
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

      const payload = { id: 1 };

      await expect(
        firstValueFrom(
          interceptor.intercept(context, handlerReturning(payload)),
        ),
      ).resolves.toEqual({ data: payload, meta: {} });

      expect(warnSpy).toHaveBeenCalledWith({
        msg: 'Failed to resolve success message',
        key: 'success.created',
        error: 'translation backend unavailable',
      });

      warnSpy.mockRestore();
    });

    it('propagates the resolved request locale to the translator', async () => {
      const { reflector } = createReflector('success.created');
      const { service, translate } = createI18n(() => 'Successfully created');
      const interceptor = new ResponseEnvelopeInterceptor(reflector, service);

      jest
        .spyOn(I18nContext, 'current')
        .mockReturnValue({ lang: 'en' } as I18nContext<
          Record<string, unknown>
        >);

      await firstValueFrom(
        interceptor.intercept(context, handlerReturning({ id: 1 })),
      );

      expect(translate).toHaveBeenCalledWith('success.created', { lang: 'en' });
    });
  });
});
