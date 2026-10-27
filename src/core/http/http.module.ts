import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AllExceptionsFilter } from '@shared/presentation/filters';
import { ResponseEnvelopeInterceptor } from '@shared/presentation/interceptors';

@Module({
  providers: [
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    AllExceptionsFilter,
  ],
  exports: [AllExceptionsFilter],
})
export class CoreHttpModule {}
