import { DataSource, DataSourceOptions } from 'typeorm';
import { typeOrmConfig } from './typeorm/typeorm.config';

const dataSourceOptions: DataSourceOptions = {
  ...(typeOrmConfig as DataSourceOptions),
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
};

const AppDataSource = new DataSource(dataSourceOptions);

export default AppDataSource;
