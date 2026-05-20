import { DataSource, DataSourceOptions } from 'typeorm';
import { getTypeOrmConfig } from './typeorm/typeorm.config';
import { loadEnvOptions } from '../config/env/load-env-options';

try {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile();
  }
} catch {
  // Ignora caso arquivo não exista ou erro ao carregar
}

const env = loadEnvOptions();

const dataSourceOptions: DataSourceOptions = {
  ...(getTypeOrmConfig(env) as DataSourceOptions),
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
};

const AppDataSource = new DataSource(dataSourceOptions);

export default AppDataSource;
