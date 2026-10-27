import { randomUUID } from 'node:crypto';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type Redis from 'ioredis';
import { SECOND_IN_MS } from '@shared/application/time';
import { describeError } from '@shared/application/logging';

export const THROTTLER_REDIS_KEY_PREFIX = 'throttler:';

// Mirrors @nestjs/throttler's in-memory storage atomically: a sliding window of
// per-hit expirations (sorted set scored by expiry), hits are not counted while
// blocked, and the budget starts over once the block ends. Time comes from
// Redis so every instance shares one clock.
const INCREMENT_SCRIPT = `
local hitsKey = KEYS[1]
local blockKey = KEYS[2]
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDuration = tonumber(ARGV[3])
local hitId = ARGV[4]

local timeToBlockExpire = redis.call('PTTL', blockKey)
if timeToBlockExpire > 0 then
  return { limit + 1, timeToBlockExpire, 1, timeToBlockExpire }
end

local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)

redis.call('ZREMRANGEBYSCORE', hitsKey, '-inf', now)
redis.call('ZADD', hitsKey, now + ttl, hitId)
redis.call('PEXPIRE', hitsKey, ttl)

local totalHits = redis.call('ZCARD', hitsKey)
local oldestHit = redis.call('ZRANGE', hitsKey, 0, 0, 'WITHSCORES')
local timeToExpire = tonumber(oldestHit[2]) - now

if totalHits > limit then
  redis.call('SET', blockKey, 1, 'PX', blockDuration)
  redis.call('DEL', hitsKey)
  return { totalHits, timeToExpire, 1, blockDuration }
end

return { totalHits, timeToExpire, 0, 0 }
`;

type ScriptResult = [number, number, 0 | 1, number];

const toSeconds = (milliseconds: number): number =>
  Math.ceil(milliseconds / SECOND_IN_MS);

export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);

  constructor(private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): ReturnType<ThrottlerStorage['increment']> {
    const baseKey = `${THROTTLER_REDIS_KEY_PREFIX}${key}:${throttlerName}`;

    try {
      const [totalHits, timeToExpire, isBlocked, timeToBlockExpire] =
        (await this.redis.eval(
          INCREMENT_SCRIPT,
          2,
          `${baseKey}:hits`,
          `${baseKey}:blocked`,
          ttl,
          limit,
          blockDuration,
          randomUUID(),
        )) as ScriptResult;

      return {
        totalHits,
        timeToExpire: toSeconds(timeToExpire),
        isBlocked: isBlocked === 1,
        timeToBlockExpire: toSeconds(timeToBlockExpire),
      };
    } catch (error) {
      this.logger.warn({
        msg: 'Rate limit storage unavailable',
        error: describeError(error),
      });

      throw new ServiceUnavailableException('errors.service_unavailable');
    }
  }
}
