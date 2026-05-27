import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { EnvOptions } from 'src/core/config/env/types/env.types';
import { isLoggingEnabled } from 'src/core/config/env/helpers/env.helpers';

export const getTypeOrmConfig = (env: EnvOptions): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: env.DB_HOST,
  port: env.DB_PORT,
  username: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  schema: env.DB_SCHEMA,
  ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
  autoLoadEntities: true,
  synchronize: false,
  logging: isLoggingEnabled,
  entities: [
    __dirname + '/../entities/**/*.entity{.ts,.js}',
    __dirname + '/../../../modules/**/infra/entities/**/*.entity{.ts,.js}',
  ],
  extra: {
    max: 20,
    connectionTimeoutMillis: 5000,
  },
});
