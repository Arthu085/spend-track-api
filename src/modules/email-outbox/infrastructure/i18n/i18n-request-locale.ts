import { Injectable } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import { AppConfigService } from '@core/config';
import type { RequestLocalePort } from '../../application/ports/request-locale.port';

@Injectable()
export class I18nRequestLocale implements RequestLocalePort {
  constructor(private readonly config: AppConfigService) {}

  current(): string {
    const context = I18nContext.current();

    if (
      context &&
      context.service.getSupportedLanguages().includes(context.lang)
    ) {
      return context.lang;
    }

    return this.config.app.defaultLocale;
  }
}
