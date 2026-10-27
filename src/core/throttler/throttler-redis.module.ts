import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import type Redis from 'ioredis';
import { AppConfigService } from '@core/config';
import {
  closeThrottlerRedis,
  connectThrottlerRedis,
  THROTTLER_REDIS_CLIENT,
} from './throttler-redis.client';

@Module({
  providers: [
    {
      provide: THROTTLER_REDIS_CLIENT,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        connectThrottlerRedis(config.throttle.redisUrl),
    },
  ],
  exports: [THROTTLER_REDIS_CLIENT],
})
export class ThrottlerRedisModule implements OnApplicationShutdown {
  constructor(
    @Inject(THROTTLER_REDIS_CLIENT) private readonly redis: Redis | null,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await closeThrottlerRedis(this.redis);
  }
}
