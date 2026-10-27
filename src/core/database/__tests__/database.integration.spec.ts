import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '../database.module';

describe('DatabaseModule (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [CoreConfigModule, DatabaseModule],
    }).compile();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('connects to the Testcontainers-provisioned Postgres instance', () => {
    expect(dataSource.isInitialized).toBe(true);
  });

  it('has run migrations against the ephemeral database', async () => {
    const executedMigrations: unknown[] = await dataSource.query(
      'SELECT * FROM migrations',
    );

    expect(Array.isArray(executedMigrations)).toBe(true);
  });

  it('has no drift between entity metadata and the migrated schema', async () => {
    const { upQueries } = await dataSource.driver.createSchemaBuilder().log();

    expect(upQueries.map((query) => query.query)).toEqual([]);
  });
});
