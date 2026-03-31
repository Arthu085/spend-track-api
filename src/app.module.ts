import { Module } from '@nestjs/common';
import { DatabaseModule } from './core/database/typeorm/typeorm.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { throttleConfig } from './core/config/throttle/throttle.config';

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
  providers: [],
})
export class AppModule {}
