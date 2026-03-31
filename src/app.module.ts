import { Module } from '@nestjs/common';
import { DatabaseModule } from './core/database/typeorm/typeorm.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { throttleConfig } from './core/config/throttle/throttle.config';
import { AppLogger } from './core/logger/logger.service';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { HttpExceptionFilter } from './core/filters/http-exception.filter';
import { ResponseInterceptor } from './core/interceptors/response.interceptor';

@Module({
  imports: [
    DatabaseModule,
    ThrottlerModule.forRoot([
      {
        ttl: throttleConfig.ttl,
        limit: throttleConfig.limit,
      },
    ]),
  ],
  controllers: [],
  providers: [
    AppLogger,
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
