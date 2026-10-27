import 'tsconfig-paths/register';
import { publishConnection } from '../support/postgres/connection-handoff';
import {
  createSchemaDataSource,
  startEphemeralPostgres,
} from '../support/postgres/lifecycle';

// Runs once for the whole `test:integration` run: starts a single ephemeral
// Postgres container, migrates it, and hands connection details to each test
// worker through the environment (see `test/integration/setup-env.ts`).
export default async function globalSetup(): Promise<void> {
  const connection = await startEphemeralPostgres('integration');

  const dataSource = createSchemaDataSource(connection);

  await dataSource.initialize();
  await dataSource.runMigrations();
  await dataSource.destroy();

  publishConnection(connection);
}
