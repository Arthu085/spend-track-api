import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { I18nContext, type TranslateOptions } from 'nestjs-i18n';

export type Translate = (key: string, options?: TranslateOptions) => string;

export const Translator = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Translate => {
    const i18nContext = I18nContext.current(context);

    if (i18nContext === undefined) {
      throw new Error('I18n context is not available for this request');
    }

    const { lang, service } = i18nContext;

    return (key, options) => service.translate(key, { lang, ...options });
  },
);
