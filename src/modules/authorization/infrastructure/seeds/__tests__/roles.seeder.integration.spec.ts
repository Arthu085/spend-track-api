import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import { RoleEnum } from '../../../domain/enums/role.enum';
import { AbilitiesSeeder } from '../abilities.seeder';
import { RolesSeeder } from '../roles.seeder';

describe('RolesSeeder (integration)', () => {
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
      'TRUNCATE TABLE "roles", "abilities" RESTART IDENTITY CASCADE',
    );
  });

  it('seeds exactly the ADMIN and USER roles, and is idempotent when run twice', async () => {
    await new AbilitiesSeeder().run(dataSource.manager);

    const seeder = new RolesSeeder();

    await seeder.run(dataSource.manager);

    const firstRunRows: Array<{ name: string; uuid: string }> =
      await dataSource.query('SELECT name, uuid FROM "roles" ORDER BY name');

    expect(firstRunRows.map((row) => row.name)).toEqual([
      RoleEnum.ADMIN,
      RoleEnum.USER,
    ]);

    await seeder.run(dataSource.manager);

    const secondRunRows: Array<{ name: string; uuid: string }> =
      await dataSource.query('SELECT name, uuid FROM "roles" ORDER BY name');

    expect(secondRunRows).toHaveLength(2);
    expect(secondRunRows).toEqual(firstRunRows);
  });
});
