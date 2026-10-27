import 'dotenv/config';
import { DataSource } from 'typeorm';
import { databaseConfig } from '@core/config';
import { buildTypeOrmOptions } from './typeorm-options';

export default new DataSource(buildTypeOrmOptions(databaseConfig()));
