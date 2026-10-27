import { Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { mockOf } from '@test/support/mocks/mock-of';
import {
  closeThrottlerRedis,
  connectThrottlerRedis,
  REDIS_COMMAND_TIMEOUT_MS,
  REDIS_CONNECT_TIMEOUT_MS,
} from '../throttler-redis.client';

const mockClient = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  on: jest.fn(),
};

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn(() => mockClient),
}));

describe('connectThrottlerRedis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.connect.mockResolvedValue(undefined);
  });

  it('creates no client when no URL is configured', async () => {
    await expect(connectThrottlerRedis('')).resolves.toBeNull();
    expect(Redis).not.toHaveBeenCalled();
  });

  it('connects before boot completes and fails commands fast instead of queueing them', async () => {
    await expect(connectThrottlerRedis('redis://redis:6379')).resolves.toBe(
      mockClient,
    );
    expect(Redis).toHaveBeenCalledWith('redis://redis:6379', {
      lazyConnect: true,
      enableOfflineQueue: false,
      connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
      commandTimeout: REDIS_COMMAND_TIMEOUT_MS,
      socketTimeout: REDIS_COMMAND_TIMEOUT_MS,
      maxRetriesPerRequest: 1,
    });
    expect(mockClient.connect).toHaveBeenCalled();
  });

  it('stops reconnecting and rethrows when the first connection fails', async () => {
    const failure = new Error('connect ECONNREFUSED 127.0.0.1:6379');

    mockClient.connect.mockRejectedValue(failure);

    await expect(connectThrottlerRedis('redis://redis:6379')).rejects.toBe(
      failure,
    );
    expect(mockClient.disconnect).toHaveBeenCalled();
  });

  it('logs connection errors instead of leaving them unhandled', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    await connectThrottlerRedis('redis://redis:6379');

    const [event, listener] = mockClient.on.mock.calls[0] as [
      string,
      (error: Error) => void,
    ];

    listener(new Error('read ECONNRESET'));

    expect(event).toBe('error');
    expect(warn).toHaveBeenCalledWith({
      msg: 'Throttler Redis connection error',
      error: 'read ECONNRESET',
    });
    warn.mockRestore();
  });
});

describe('closeThrottlerRedis', () => {
  const quit = jest.fn();
  const disconnect = jest.fn();

  const clientWithStatus = (status: Redis['status']) =>
    mockOf<Redis>({ status, quit, disconnect });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does nothing without a client', async () => {
    await expect(closeThrottlerRedis(null)).resolves.toBeUndefined();
  });

  it('quits gracefully when connected', async () => {
    quit.mockResolvedValueOnce('OK');

    await closeThrottlerRedis(clientWithStatus('ready'));

    expect(quit).toHaveBeenCalled();
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('disconnects when the connection drops before QUIT is acknowledged', async () => {
    quit.mockRejectedValueOnce(new Error('Connection is closed.'));

    await closeThrottlerRedis(clientWithStatus('ready'));

    expect(disconnect).toHaveBeenCalled();
  });

  it('disconnects immediately while reconnecting, where QUIT could not be sent', async () => {
    await closeThrottlerRedis(clientWithStatus('reconnecting'));

    expect(disconnect).toHaveBeenCalled();
    expect(quit).not.toHaveBeenCalled();
  });
});
