import { Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import type { DataSource } from 'typeorm';
import { mockOf } from '@test/support/mocks/mock-of';
import {
  READINESS_CHECK_TIMEOUT_MS,
  ReadinessService,
} from '../readiness.service';

const never = <T>(): Promise<T> => new Promise<T>(() => undefined);

describe('ReadinessService', () => {
  let query: jest.Mock;
  let on: jest.Mock;
  let removeListener: jest.Mock;
  let connection: {
    query: jest.Mock;
    on: jest.Mock;
    removeListener: jest.Mock;
  };
  let release: jest.Mock;
  let obtainMasterConnection: jest.Mock;
  let service: ReadinessService;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    query = jest.fn();
    on = jest.fn();
    removeListener = jest.fn();
    connection = { query, on, removeListener };
    release = jest.fn();
    obtainMasterConnection = jest
      .fn()
      .mockImplementation(() => Promise.resolve([connection, release]));
    service = new ReadinessService(
      mockOf<DataSource>({
        driver: { obtainMasterConnection } as unknown as DataSource['driver'],
      }),
    );
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('is ready and returns the connection to the pool when SELECT 1 answers', async () => {
    query.mockResolvedValue({ rows: [{ '?column?': 1 }] });

    await expect(service.isReady()).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith('SELECT 1');
    expect(release).toHaveBeenCalledWith();
    expect(warn).not.toHaveBeenCalled();
  });

  it('is not ready, discards the connection, and logs a masked warning when the query fails', async () => {
    const failure = new Error(
      'password authentication failed for user "jane@example.com"',
    );

    query.mockRejectedValue(failure);

    await expect(service.isReady()).resolves.toBe(false);
    expect(release).toHaveBeenCalledWith(failure);
    expect(warn).toHaveBeenCalledWith({
      msg: 'Readiness check failed',
      check: 'database',
      error: 'password authentication failed for user "j***@example.com"',
    });
  });

  it('guards the checked-out connection against error events until it is returned', async () => {
    query.mockResolvedValue({ rows: [] });

    await service.isReady();

    const [[event, listener]] = on.mock.calls as [
      [string, (error: Error) => void],
    ];

    expect(event).toBe('error');
    expect(() => listener(new Error('read ECONNRESET'))).not.toThrow();
    expect(removeListener).toHaveBeenCalledWith('error', listener);
  });

  it('keeps the error guard on a connection discarded after a failure', async () => {
    query.mockRejectedValue(new Error('read ECONNRESET'));

    await service.isReady();

    expect(on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(removeListener).not.toHaveBeenCalled();
  });

  it('is not ready when no connection can be obtained', async () => {
    obtainMasterConnection.mockRejectedValue(new Error('connect ECONNREFUSED'));

    await expect(service.isReady()).resolves.toBe(false);
    expect(release).not.toHaveBeenCalled();
  });

  it('discards a connection whose query stalls past the timeout', async () => {
    jest.useFakeTimers();
    query.mockReturnValue(never());

    const result = service.isReady();
    await jest.advanceTimersByTimeAsync(READINESS_CHECK_TIMEOUT_MS);

    await expect(result).resolves.toBe(false);
    expect(release).toHaveBeenCalledWith(
      expect.objectContaining({
        message: `Database ping exceeded ${READINESS_CHECK_TIMEOUT_MS}ms`,
      }),
    );
  });

  it('discards a connection that arrives after the timeout', async () => {
    jest.useFakeTimers();
    let deliverConnection: (value: unknown) => void = () => undefined;
    obtainMasterConnection.mockReturnValue(
      new Promise((resolve) => {
        deliverConnection = resolve;
      }),
    );

    const result = service.isReady();
    await jest.advanceTimersByTimeAsync(READINESS_CHECK_TIMEOUT_MS);
    await expect(result).resolves.toBe(false);

    deliverConnection([connection, release]);
    await jest.advanceTimersByTimeAsync(0);

    expect(query).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledWith(expect.any(Error));
  });

  it('starts a fresh ping after a stalled one times out', async () => {
    jest.useFakeTimers();
    query.mockReturnValueOnce(never()).mockResolvedValueOnce({ rows: [] });

    const stalled = service.isReady();
    await jest.advanceTimersByTimeAsync(READINESS_CHECK_TIMEOUT_MS);

    await expect(stalled).resolves.toBe(false);
    await expect(service.isReady()).resolves.toBe(true);
    expect(obtainMasterConnection).toHaveBeenCalledTimes(2);
  });

  it('shares one in-flight ping between overlapping checks', async () => {
    jest.useFakeTimers();
    query.mockReturnValue(never());

    const results = [service.isReady(), service.isReady(), service.isReady()];
    await jest.advanceTimersByTimeAsync(READINESS_CHECK_TIMEOUT_MS);

    await expect(Promise.all(results)).resolves.toEqual([false, false, false]);
    expect(obtainMasterConnection).toHaveBeenCalledTimes(1);
  });

  it('wraps a non-Error rejection before discarding the connection', async () => {
    query.mockRejectedValue('socket hang up');

    await expect(service.isReady()).resolves.toBe(false);
    expect(release).toHaveBeenCalledWith(new Error('socket hang up'));
  });

  describe('with a Redis throttler storage', () => {
    let ping: jest.Mock;

    beforeEach(() => {
      query.mockResolvedValue({ rows: [] });
      ping = jest.fn().mockResolvedValue('PONG');
      service = new ReadinessService(
        mockOf<DataSource>({
          driver: { obtainMasterConnection } as unknown as DataSource['driver'],
        }),
        mockOf<Redis>({ ping }),
      );
    });

    it('is ready when both PostgreSQL and Redis answer', async () => {
      await expect(service.isReady()).resolves.toBe(true);
      expect(ping).toHaveBeenCalledTimes(1);
      expect(warn).not.toHaveBeenCalled();
    });

    it('is not ready and logs the Redis check when Redis is unreachable', async () => {
      ping.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:6379'));

      await expect(service.isReady()).resolves.toBe(false);
      expect(warn).toHaveBeenCalledWith({
        msg: 'Readiness check failed',
        check: 'redis',
        error: 'connect ECONNREFUSED 10.0.0.5:6379',
      });
    });

    it('is not ready when PostgreSQL fails even though Redis answers', async () => {
      query.mockRejectedValue(new Error('connect ECONNREFUSED'));

      await expect(service.isReady()).resolves.toBe(false);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ check: 'database' }),
      );
    });

    it('is not ready when the Redis ping stalls past the timeout', async () => {
      jest.useFakeTimers();
      ping.mockReturnValue(never());

      const result = service.isReady();
      await jest.advanceTimersByTimeAsync(READINESS_CHECK_TIMEOUT_MS);

      await expect(result).resolves.toBe(false);
      expect(warn).toHaveBeenCalledWith({
        msg: 'Readiness check failed',
        check: 'redis',
        error: `Redis ping exceeded ${READINESS_CHECK_TIMEOUT_MS}ms`,
      });
    });

    it('shares one in-flight Redis ping between overlapping checks', async () => {
      jest.useFakeTimers();
      ping.mockReturnValue(never());

      const results = [service.isReady(), service.isReady()];
      await jest.advanceTimersByTimeAsync(READINESS_CHECK_TIMEOUT_MS);

      await expect(Promise.all(results)).resolves.toEqual([false, false]);
      expect(ping).toHaveBeenCalledTimes(1);
    });
  });
});
