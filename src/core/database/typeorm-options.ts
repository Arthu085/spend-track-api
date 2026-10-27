import { join } from 'path';
import type { ConfigType } from '@nestjs/config';
import type { DataSourceOptions } from 'typeorm';
import type { databaseConfig } from '@core/config';

export type DatabaseConnectionConfig = Pick<
  ConfigType<typeof databaseConfig>,
  | 'host'
  | 'port'
  | 'user'
  | 'password'
  | 'name'
  | 'ssl'
  | 'poolMax'
  | 'statementTimeoutMs'
>;

export function buildTypeOrmOptions(
  database: DatabaseConnectionConfig,
): DataSourceOptions {
  return {
    type: 'postgres',
    host: database.host,
    port: database.port,
    username: database.user,
    password: database.password,
    database: database.name,
    ssl: database.ssl,
    poolSize: database.poolMax,
    extra: { statement_timeout: database.statementTimeoutMs },
    entities: [join(__dirname, '..', '..', '**', '*.orm-entity{.ts,.js}')],
    migrations: [join(__dirname, 'migrations', '*{.ts,.js}')],
    synchronize: false,
    uuidExtension: 'pgcrypto',
  };
}
