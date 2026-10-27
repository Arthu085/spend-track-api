import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { THROTTLER_REDIS_CLIENT } from '@core/throttler';
import { describeError } from '@shared/application/logging';

export const READINESS_CHECK_TIMEOUT_MS = 2_000;

type ConnectionErrorListener = (error: Error) => void;

interface PooledConnection {
  query(sql: string): Promise<unknown>;
  on(event: 'error', listener: ConnectionErrorListener): unknown;
  removeListener(event: 'error', listener: ConnectionErrorListener): unknown;
}

type ReleaseConnection = (error?: Error) => void;

type ReadinessCheck = 'database' | 'redis';

interface PooledConnectionSource {
  obtainMasterConnection(): Promise<[PooledConnection, ReleaseConnection]>;
}

// pg emits 'error' on a checked-out client whose socket breaks, and an
// unhandled 'error' event crashes the process; the failed query already
// reports the cause.
const ignoreConnectionError: ConnectionErrorListener = () => undefined;

class ReadinessTimeoutError extends Error {
  constructor(target: string) {
    super(`${target} ping exceeded ${READINESS_CHECK_TIMEOUT_MS}ms`);
  }
}

@Injectable()
export class ReadinessService {
  private readonly logger = new Logger(ReadinessService.name);

  private readonly pendingPings = new Map<ReadinessCheck, Promise<void>>();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional()
    @Inject(THROTTLER_REDIS_CLIENT)
    private readonly redis: Redis | null = null,
  ) {}

  async isReady(): Promise<boolean> {
    const { redis } = this;

    const results = await Promise.all([
      this.check('database', () => this.pingDatabase()),
      ...(redis ? [this.check('redis', () => this.pingRedis(redis))] : []),
    ]);

    return results.every(Boolean);
  }

  private async check(
    name: ReadinessCheck,
    ping: () => Promise<void>,
  ): Promise<boolean> {
    try {
      let pending = this.pendingPings.get(name);

      if (!pending) {
        pending = ping().finally(() => this.pendingPings.delete(name));
        this.pendingPings.set(name, pending);
      }

      await pending;

      return true;
    } catch (error) {
      this.logger.warn({
        msg: 'Readiness check failed',
        check: name,
        error: describeError(error),
      });

      return false;
    }
  }

  private async pingRedis(redis: Redis): Promise<void> {
    await this.withTimeout(
      redis.ping().then(() => undefined),
      new ReadinessTimeoutError('Redis'),
    );
  }

  private async pingDatabase(): Promise<void> {
    const source = this.dataSource.driver as unknown as PooledConnectionSource;

    let release: ReleaseConnection | undefined;
    let abandoned = false;

    const ping = async (): Promise<void> => {
      const [connection, releaseConnection] =
        await source.obtainMasterConnection();

      connection.on('error', ignoreConnectionError);

      if (abandoned) {
        releaseConnection(new ReadinessTimeoutError('Database'));
        return;
      }

      release = (error) => {
        if (error) {
          releaseConnection(error);
          return;
        }

        connection.removeListener('error', ignoreConnectionError);
        releaseConnection();
      };
      await connection.query('SELECT 1');
    };

    try {
      await this.withTimeout(ping(), new ReadinessTimeoutError('Database'));
      release?.();
    } catch (error) {
      abandoned = true;
      release?.(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private async withTimeout(
    work: Promise<void>,
    timeoutError: ReadinessTimeoutError,
  ): Promise<void> {
    let timer: NodeJS.Timeout | undefined;

    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(timeoutError),
        READINESS_CHECK_TIMEOUT_MS,
      );
    });

    try {
      await Promise.race([work, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}
