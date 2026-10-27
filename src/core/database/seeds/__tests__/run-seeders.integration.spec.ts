import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import {
  AbilitiesSeeder,
  RoleAbilitiesSeeder,
  RolesSeeder,
} from '@modules/authorization/persistence';
import { UsersSeeder } from '@modules/users/persistence';
import { runSeeders } from '../run-seeders';
import { Seeder } from '../seeder.interface';
import { seeders } from '../seeders';

interface TableCounts {
  abilities: number;
  roles: number;
  roleAbilities: number;
  users: number;
}

describe('runSeeders (integration)', () => {
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
      'TRUNCATE TABLE "users", "roles", "abilities" RESTART IDENTITY CASCADE',
    );
  });

  async function countRows(): Promise<TableCounts> {
    const [row]: Array<Record<keyof TableCounts, string>> =
      await dataSource.query(`
        SELECT
          (SELECT COUNT(*) FROM "abilities") AS "abilities",
          (SELECT COUNT(*) FROM "roles") AS "roles",
          (SELECT COUNT(*) FROM "role_abilities") AS "roleAbilities",
          (SELECT COUNT(*) FROM "users") AS "users"
      `);

    return {
      abilities: Number(row.abilities),
      roles: Number(row.roles),
      roleAbilities: Number(row.roleAbilities),
      users: Number(row.users),
    };
  }

  const EMPTY: TableCounts = {
    abilities: 0,
    roles: 0,
    roleAbilities: 0,
    users: 0,
  };

  it('seeds the registry and leaves the data unchanged on re-run', async () => {
    await runSeeders(dataSource, seeders);

    const firstRun = await countRows();

    expect(firstRun.abilities).toBeGreaterThan(0);
    expect(firstRun.roles).toBe(2);
    expect(firstRun.users).toBe(1);

    await runSeeders(dataSource, seeders);

    expect(await countRows()).toEqual(firstRun);
  });

  it('rolls back every earlier seeder when a later one fails', async () => {
    const failing: Seeder = {
      name: 'failing-seeder',
      run: () => Promise.reject(new Error('boom')),
    };

    await expect(runSeeders(dataSource, [...seeders, failing])).rejects.toThrow(
      'Seeder "failing-seeder" failed',
    );

    expect(await countRows()).toEqual(EMPTY);
  });

  it('fails and rolls back when users are seeded before their role exists', async () => {
    const error: unknown = await runSeeders(dataSource, [
      new AbilitiesSeeder(),
      new UsersSeeder(),
    ]).catch((thrown: unknown) => thrown);

    expect((error as Error).message).toBe('Seeder "users-seeder" failed');
    expect(((error as Error).cause as Error).message).toMatch(
      /role "ADMIN" does not exist/,
    );
    expect(await countRows()).toEqual(EMPTY);
  });

  it('fails and rolls back when roles are seeded before their abilities exist', async () => {
    await expect(
      runSeeders(dataSource, [new RolesSeeder(), new RoleAbilitiesSeeder()]),
    ).rejects.toThrow('Seeder "roles-seeder" failed');

    expect(await countRows()).toEqual(EMPTY);
  });

  it('keeps previously committed seed data when a later run fails', async () => {
    await runSeeders(dataSource, seeders);

    const committed = await countRows();

    await dataSource.query('DELETE FROM "users"');

    const failing: Seeder = {
      name: 'failing-seeder',
      run: () => Promise.reject(new Error('boom')),
    };

    await expect(runSeeders(dataSource, [...seeders, failing])).rejects.toThrow(
      'Seeder "failing-seeder" failed',
    );

    expect(await countRows()).toEqual({ ...committed, users: 0 });
  });
});
