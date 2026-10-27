import { join } from 'path';
import { Module } from '@nestjs/common';
import {
  AcceptLanguageResolver,
  HeaderResolver,
  I18nModule,
  QueryResolver,
} from 'nestjs-i18n';
import { AppConfigService } from '@core/config';

@Module({
  imports: [
    I18nModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        fallbackLanguage: config.app.defaultLocale,
        loaderOptions: {
          path: join(__dirname, '..', '..', 'i18n'),
          watch: config.app.nodeEnv !== 'production',
        },
      }),
      resolvers: [
        AcceptLanguageResolver,
        new HeaderResolver(['x-lang']),
        new QueryResolver(['lang']),
      ],
    }),
  ],
})
export class CoreI18nModule {}
