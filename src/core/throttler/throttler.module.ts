import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type Redis from 'ioredis';
import { AppConfigService } from '@core/config';
import { RedisThrottlerStorage } from './redis-throttler.storage';
import { THROTTLER_REDIS_CLIENT } from './throttler-redis.client';
import { ThrottlerRedisModule } from './throttler-redis.module';
import { buildThrottlerOptions } from './throttler-options.factory';

@Global()
@Module({
  imports: [
    ThrottlerRedisModule,
    ThrottlerModule.forRootAsync({
      imports: [ThrottlerRedisModule],
      inject: [AppConfigService, THROTTLER_REDIS_CLIENT],
      useFactory: (config: AppConfigService, redis: Redis | null) =>
        buildThrottlerOptions({
          ttl: config.throttle.ttl,
          limit: config.throttle.limit,
          auth: config.throttle.auth,
          storage: redis ? new RedisThrottlerStorage(redis) : undefined,
        }),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
  exports: [ThrottlerRedisModule],
})
export class CoreThrottlerModule {}
