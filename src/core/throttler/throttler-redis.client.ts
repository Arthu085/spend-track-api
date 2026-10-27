import { Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { describeError } from '@shared/application/logging';

export const THROTTLER_REDIS_CLIENT = Symbol('THROTTLER_REDIS_CLIENT');

export const REDIS_CONNECT_TIMEOUT_MS = 2_000;

export const REDIS_COMMAND_TIMEOUT_MS = 1_000;

const logger = new Logger('ThrottlerRedis');

export async function connectThrottlerRedis(
  url: string,
): Promise<Redis | null> {
  if (!url) {
    return null;
  }

  const client = new Redis(url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
    commandTimeout: REDIS_COMMAND_TIMEOUT_MS,
    socketTimeout: REDIS_COMMAND_TIMEOUT_MS,
    maxRetriesPerRequest: 1,
  });

  client.on('error', (error) => {
    logger.warn({
      msg: 'Throttler Redis connection error',
      error: describeError(error),
    });
  });

  try {
    await client.connect();
  } catch (error) {
    client.disconnect();
    throw error;
  }

  return client;
}

export async function closeThrottlerRedis(client: Redis | null): Promise<void> {
  if (client?.status === 'ready') {
    await client.quit().catch(() => client.disconnect());
    return;
  }

  client?.disconnect();
}
