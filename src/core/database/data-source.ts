import { DataSource, DataSourceOptions } from 'typeorm';
import { typeOrmConfig } from './typeorm/typeorm.config';

const dataSourceOptions: DataSourceOptions = {
  ...(typeOrmConfig as DataSourceOptions),
  entities: [
    __dirname + '/../database/entities/*.entity{.ts,.js}',
    __dirname + '/../../modules/**/infra/entities/*.entity{.ts,.js}',
  ],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
};

const AppDataSource = new DataSource(dataSourceOptions);

export default AppDataSource;
