import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import { ABILITY_CATALOG } from '../../../domain/catalog/ability-catalog';
import { AbilitiesSeeder } from '../abilities.seeder';

describe('AbilitiesSeeder (integration)', () => {
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

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "abilities" RESTART IDENTITY CASCADE',
    );
  });

  it('seeds the full code-side catalog, and is idempotent when run twice', async () => {
    const seeder = new AbilitiesSeeder();

    await seeder.run(dataSource.manager);

    const firstRunCount: Array<{ count: string }> = await dataSource.query(
      'SELECT COUNT(*) as count FROM "abilities"',
    );

    expect(Number(firstRunCount[0].count)).toBe(ABILITY_CATALOG.length);

    await seeder.run(dataSource.manager);

    const secondRunCount: Array<{ count: string }> = await dataSource.query(
      'SELECT COUNT(*) as count FROM "abilities"',
    );

    expect(Number(secondRunCount[0].count)).toBe(ABILITY_CATALOG.length);
  });
});
