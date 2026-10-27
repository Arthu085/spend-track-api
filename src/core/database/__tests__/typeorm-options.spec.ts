import { join } from 'path';
import { DatabaseModule } from '../database.module';
import { buildTypeOrmOptions } from '../typeorm-options';

// The runtime module must never pull in the CLI data source, which loads
// `dotenv/config` and reads `process.env` at import time.
jest.mock('dotenv/config', () => {
  throw new Error('dotenv/config must not be loaded at runtime');
});
jest.mock('../data-source', () => {
  throw new Error('data-source must not be loaded at runtime');
});

describe('buildTypeOrmOptions', () => {
  const database = {
    host: 'db.internal',
    port: 6543,
    user: 'app',
    password: 'secret',
    name: 'app_db',
    ssl: false,
    poolMax: 10,
    statementTimeoutMs: 0,
  };

  it('maps the database config to Postgres connection options', () => {
    expect(buildTypeOrmOptions(database)).toEqual({
      type: 'postgres',
      host: 'db.internal',
      port: 6543,
      username: 'app',
      password: 'secret',
      database: 'app_db',
      ssl: false,
      poolSize: 10,
      extra: { statement_timeout: 0 },
      entities: [
        join(__dirname, '..', '..', '..', '**', '*.orm-entity{.ts,.js}'),
      ],
      migrations: [join(__dirname, '..', 'migrations', '*{.ts,.js}')],
      synchronize: false,
      uuidExtension: 'pgcrypto',
    });
  });

  it('maps the managed-host settings to SSL, pool size and statement timeout', () => {
    expect(
      buildTypeOrmOptions({
        ...database,
        ssl: true,
        poolMax: 25,
        statementTimeoutMs: 30000,
      }),
    ).toMatchObject({
      ssl: true,
      poolSize: 25,
      extra: { statement_timeout: 30000 },
    });
  });

  it('lets the runtime DatabaseModule load without the CLI data source', () => {
    expect(DatabaseModule).toBeDefined();
  });
});
