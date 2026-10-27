import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  appConfig,
  cookieConfig,
  corsConfig,
  databaseConfig,
  emailOutboxConfig,
  emailQuotaConfig,
  jwtConfig,
  loggingConfig,
  mailConfig,
  refreshTokenCleanupConfig,
  retentionCleanupConfig,
  throttleConfig,
  verificationTokensConfig,
} from './configurations';
import { AppConfigService } from './services/app-config.service';
import { validationSchema } from './validation/env.validation';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        appConfig,
        databaseConfig,
        jwtConfig,
        corsConfig,
        throttleConfig,
        cookieConfig,
        loggingConfig,
        refreshTokenCleanupConfig,
        retentionCleanupConfig,
        verificationTokensConfig,
        mailConfig,
        emailQuotaConfig,
        emailOutboxConfig,
      ],
      validationSchema,
      validationOptions: { abortEarly: false },
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class CoreConfigModule {}
