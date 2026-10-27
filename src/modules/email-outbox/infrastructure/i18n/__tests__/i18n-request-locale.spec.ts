import { I18nContext, type I18nService } from 'nestjs-i18n';
import type { AppConfigService } from '@core/config';
import { I18nRequestLocale } from '../i18n-request-locale';
import { mockOf } from '@test/support/mocks/mock-of';

function mockContext(lang: string): void {
  jest.spyOn(I18nContext, 'current').mockReturnValue(
    mockOf<I18nContext>({
      lang,
      service: mockOf<I18nService>({
        getSupportedLanguages: () => ['pt-BR', 'en'],
      }),
    }),
  );
}

describe('I18nRequestLocale', () => {
  const config = mockOf<AppConfigService>({
    app: { defaultLocale: 'pt-BR' } as AppConfigService['app'],
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the supported language resolved for the current request', () => {
    mockContext('en');

    expect(new I18nRequestLocale(config).current()).toBe('en');
  });

  it.each(['zz', 'x'.repeat(64)])(
    'falls back to the default locale for an unsupported language (%s), so a raw x-lang or ?lang= value is never stored',
    (lang) => {
      mockContext(lang);

      expect(new I18nRequestLocale(config).current()).toBe('pt-BR');
    },
  );

  it('falls back to the default locale outside a request', () => {
    jest.spyOn(I18nContext, 'current').mockReturnValue(undefined);

    expect(new I18nRequestLocale(config).current()).toBe('pt-BR');
  });
});
