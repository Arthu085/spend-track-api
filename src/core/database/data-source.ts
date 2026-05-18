import { DataSource, DataSourceOptions } from 'typeorm';
import { getTypeOrmConfig } from './typeorm/typeorm.config';
import { envConfig } from '../config/env/env.config';

try {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile();
  }
} catch {
  // Ignora caso arquivo não exista ou erro ao carregar
}

const env = envConfig();

const dataSourceOptions: DataSourceOptions = {
  ...(getTypeOrmConfig(env) as DataSourceOptions),
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
};

const AppDataSource = new DataSource(dataSourceOptions);

export default AppDataSource;
