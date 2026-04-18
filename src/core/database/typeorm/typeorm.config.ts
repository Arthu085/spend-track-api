import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { envConfig } from 'src/core/config/env/env.config';
import { isLoggingEnabled } from 'src/core/config/env/helpers/env.helpers';

export const typeOrmConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  host: envConfig.DB_HOST,
  port: envConfig.DB_PORT,
  username: envConfig.DB_USERNAME,
  password: envConfig.DB_PASSWORD,
  database: envConfig.DB_NAME,
  schema: envConfig.DB_SCHEMA,
  ssl: envConfig.DB_SSL ? { rejectUnauthorized: false } : false,
  autoLoadEntities: true,
  synchronize: false,
  logging: isLoggingEnabled,

  entities: [__dirname + '/../../../**/*.orm.entity{.ts,.js}'],
};
