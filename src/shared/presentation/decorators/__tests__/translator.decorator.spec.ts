import 'reflect-metadata';
import type { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { I18nContext, type I18nService } from 'nestjs-i18n';
import { Translator, type Translate } from '../translator.decorator';

type TranslatorFactory = (
  data: unknown,
  context: ExecutionContext,
) => Translate;

// Nest stores custom param decorator factories in route-args metadata; reading
// it back exercises the same factory the router calls per request.
function getTranslatorFactory(): TranslatorFactory {
  class ProbeController {
    handle(@Translator() translate: Translate): Translate {
      return translate;
    }
  }

  const args = Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    ProbeController,
    'handle',
  ) as Record<string, { factory: TranslatorFactory }>;

  return Object.values(args)[0].factory;
}

describe('Translator', () => {
  const context = {} as ExecutionContext;
  const factory = getTranslatorFactory();

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function mockI18nContext(lang: string) {
    const translate = jest.fn().mockReturnValue('translated');

    const current = jest.spyOn(I18nContext, 'current').mockReturnValue({
      lang,
      service: { translate } as unknown as I18nService,
    } as I18nContext);

    return { translate, current };
  }

  it('binds the request language to I18nService.translate', () => {
    const { translate, current } = mockI18nContext('en');

    const result = factory(undefined, context)('some.key');

    expect(result).toBe('translated');
    expect(current).toHaveBeenCalledWith(context);
    expect(translate).toHaveBeenCalledWith('some.key', { lang: 'en' });
  });

  it('forwards extra translate options alongside the bound language', () => {
    const { translate } = mockI18nContext('pt-BR');

    factory(undefined, context)('some.key', { args: { property: 'uuid' } });

    expect(translate).toHaveBeenCalledWith('some.key', {
      lang: 'pt-BR',
      args: { property: 'uuid' },
    });
  });

  it('throws when no i18n context is available', () => {
    jest.spyOn(I18nContext, 'current').mockReturnValue(undefined);

    expect(() => factory(undefined, context)).toThrow(
      'I18n context is not available for this request',
    );
  });
});
