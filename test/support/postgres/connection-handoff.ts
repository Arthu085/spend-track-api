export type TestSuite = 'integration' | 'e2e';

export interface TestDbConnection {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

const CONNECTION_ENV_VAR = 'TEST_DB_CONNECTION';

// Bridges globalSetup and each test worker: globalSetup runs in the main Jest
// process before any worker is forked, and workers inherit its `process.env`
// (with `--runInBand` they share it). Keeping the handoff in the run's own
// environment, instead of a fixed file on disk, lets concurrent runs from
// other worktrees or sessions each see only their own container.
export function publishConnection(connection: TestDbConnection): void {
  process.env[CONNECTION_ENV_VAR] = JSON.stringify(connection);
}

export function readConnection(): TestDbConnection {
  const serialized = process.env[CONNECTION_ENV_VAR];

  if (!serialized) {
    throw new Error(
      `${CONNECTION_ENV_VAR} is not set; run this suite through its Jest config so globalSetup starts the database.`,
    );
  }

  return JSON.parse(serialized) as TestDbConnection;
}
