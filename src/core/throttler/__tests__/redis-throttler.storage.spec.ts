import { Logger, ServiceUnavailableException } from '@nestjs/common';
import type Redis from 'ioredis';
import { mockOf } from '@test/support/mocks/mock-of';
import {
  RedisThrottlerStorage,
  THROTTLER_REDIS_KEY_PREFIX,
} from '../redis-throttler.storage';

// The script's counting semantics run against a real Redis in
// `test/e2e/throttle-redis.e2e-spec.ts`; this spec covers the TypeScript side.
describe('RedisThrottlerStorage', () => {
  let evalScript: jest.Mock;
  let warn: jest.SpyInstance;
  let storage: RedisThrottlerStorage;

  beforeEach(() => {
    evalScript = jest.fn();
    storage = new RedisThrottlerStorage(
      mockOf<Redis>({ eval: evalScript as unknown as Redis['eval'] }),
    );
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('runs the script on namespaced keys with the budget and a unique hit id', async () => {
    evalScript.mockResolvedValue([1, 60_000, 0, 0]);

    await storage.increment('abc123', 60_000, 5, 60_000, 'default');
    await storage.increment('abc123', 60_000, 5, 60_000, 'default');

    const [first, second] = evalScript.mock.calls as unknown[][];

    expect(first.slice(1, 7)).toEqual([
      2,
      `${THROTTLER_REDIS_KEY_PREFIX}abc123:default:hits`,
      `${THROTTLER_REDIS_KEY_PREFIX}abc123:default:blocked`,
      60_000,
      5,
      60_000,
    ]);
    expect(first[7]).toEqual(expect.any(String));
    expect(first[7]).not.toBe(second[7]);
  });

  it('maps the script result to a storage record with times in whole seconds', async () => {
    evalScript.mockResolvedValue([3, 41_200, 0, 0]);

    await expect(
      storage.increment('abc123', 60_000, 5, 60_000, 'default'),
    ).resolves.toEqual({
      totalHits: 3,
      timeToExpire: 42,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  it('reports a block with its remaining time', async () => {
    evalScript.mockResolvedValue([6, 59_001, 1, 59_001]);

    await expect(
      storage.increment('abc123', 60_000, 5, 60_000, 'default'),
    ).resolves.toEqual({
      totalHits: 6,
      timeToExpire: 60,
      isBlocked: true,
      timeToBlockExpire: 60,
    });
  });

  it('fails closed with a localized 503 and logs the cause when Redis is unavailable', async () => {
    evalScript.mockRejectedValue(
      new Error(
        "Stream isn't writeable and enableOfflineQueue options is false",
      ),
    );

    const attempt = storage.increment('abc123', 60_000, 5, 60_000, 'default');

    await expect(attempt).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(attempt).rejects.toThrow('errors.service_unavailable');
    expect(warn).toHaveBeenCalledWith({
      msg: 'Rate limit storage unavailable',
      error: "Stream isn't writeable and enableOfflineQueue options is false",
    });
  });
});
