import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigService } from '@core/config';
import { buildPinoHttpOptions } from './pino-options.factory';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        buildPinoHttpOptions({
          level: config.logging.level,
          pretty: config.logging.pretty,
        }),
    }),
  ],
})
export class CoreLoggingModule {}
