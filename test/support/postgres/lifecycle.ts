import { join } from 'node:path';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { TestDbConnection, TestSuite } from './connection-handoff';
import {
  getPostgresContainer,
  setPostgresContainer,
} from './container-registry';

const POSTGRES_IMAGE = 'postgres:16-alpine';
const SRC_ROOT = join(__dirname, '..', '..', '..', 'src');

// Runs once per suite run: starts a single ephemeral Postgres container and
// hands its connection details back to the caller's globalSetup, which is
// responsible for migrating/seeding it and publishing the connection (see
// `connection-handoff.ts`) once that's done.
export async function startEphemeralPostgres(
  suite: TestSuite,
): Promise<TestDbConnection> {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();

  setPostgresContainer(suite, container);

  return {
    host: container.getHost(),
    port: container.getMappedPort(5432),
    user: container.getUsername(),
    password: container.getPassword(),
    database: container.getDatabase(),
  };
}

export async function stopEphemeralPostgres(suite: TestSuite): Promise<void> {
  const container = getPostgresContainer(suite);

  if (container) {
    await container.stop();
  }
}

// Does not import `@core/database/data-source` (or anything that pulls in
// `@core/config`) on purpose: that module triggers `@nestjs/config` Joi env
// validation at import time, which would force every env var to be
// pre-set before `test/e2e/global-setup.ts` even starts the container.
export function createSchemaDataSource(
  connection: TestDbConnection,
): DataSource {
  return new DataSource({
    type: 'postgres',
    host: connection.host,
    port: connection.port,
    username: connection.user,
    password: connection.password,
    database: connection.database,
    entities: [join(SRC_ROOT, '**', '*.orm-entity{.ts,.js}')],
    migrations: [
      join(SRC_ROOT, 'core', 'database', 'migrations', '*{.ts,.js}'),
    ],
  });
}
