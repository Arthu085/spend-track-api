import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import { AbilitiesSeeder } from '@modules/authorization/infrastructure/seeds/abilities.seeder';
import { RolesSeeder } from '@modules/authorization/infrastructure/seeds/roles.seeder';
import { UsersSeeder } from '../users.seeder';

interface UserRow {
  email: string;
  password: string;
}

interface UserRowWithConfirmation extends UserRow {
  email_confirmed_at: Date | null;
}

const SEED_ADMIN_EMAIL = 'seed-admin@example.com';

describe('UsersSeeder (integration)', () => {
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

  async function seedRoles(): Promise<void> {
    await new AbilitiesSeeder().run(dataSource.manager);
    await new RolesSeeder().run(dataSource.manager);
  }

  it('seeds the admin account with a hashed password and role assignment, idempotently', async () => {
    await seedRoles();

    const seeder = new UsersSeeder();
    await seeder.run(dataSource.manager);

    const firstRunRows: UserRow[] = await dataSource.query(
      'SELECT email, password FROM "users" ORDER BY email',
    );

    expect(firstRunRows.map((row) => row.email)).toEqual([SEED_ADMIN_EMAIL]);

    for (const row of firstRunRows) {
      expect(row.password.startsWith('$argon2')).toBe(true);
    }

    const roleAssignments: Array<{ email: string; name: string }> =
      await dataSource.query(`
        SELECT u.email as email, r.name as name
        FROM "users" u
        JOIN "user_roles" ur ON ur.user_id = u.id
        JOIN "roles" r ON r.id = ur.role_id
        ORDER BY u.email
      `);

    expect(roleAssignments).toEqual([
      { email: SEED_ADMIN_EMAIL, name: 'ADMIN' },
    ]);

    await seeder.run(dataSource.manager);

    const secondRunRows: UserRow[] = await dataSource.query(
      'SELECT email, password FROM "users" ORDER BY email',
    );

    expect(secondRunRows).toEqual(firstRunRows);
  });

  it('fails to seed the admin account when its target role does not exist yet', async () => {
    // Roles are intentionally not seeded here.
    await expect(new UsersSeeder().run(dataSource.manager)).rejects.toThrow(
      `Cannot seed user "${SEED_ADMIN_EMAIL}": role "ADMIN" does not exist`,
    );

    const rows: UserRow[] = await dataSource.query('SELECT email FROM "users"');
    expect(rows).toHaveLength(0);
  });

  it('seeds the admin account with emailConfirmedAt already set', async () => {
    await seedRoles();
    await new UsersSeeder().run(dataSource.manager);

    const rows: UserRowWithConfirmation[] = await dataSource.query(
      'SELECT email, email_confirmed_at FROM "users" ORDER BY email',
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].email_confirmed_at).not.toBeNull();
  });

  it('repairs a pre-existing unconfirmed seed row idempotently on re-run', async () => {
    await seedRoles();
    await new UsersSeeder().run(dataSource.manager);

    // Simulate a pre-existing seed row with email_confirmed_at left NULL.
    await dataSource.query(
      'UPDATE "users" SET email_confirmed_at = NULL WHERE email = $1',
      [SEED_ADMIN_EMAIL],
    );

    const beforeRepair: UserRowWithConfirmation[] = await dataSource.query(
      'SELECT email, email_confirmed_at FROM "users" WHERE email = $1',
      [SEED_ADMIN_EMAIL],
    );

    expect(beforeRepair[0].email_confirmed_at).toBeNull();

    await new UsersSeeder().run(dataSource.manager);

    const afterRepair: UserRowWithConfirmation[] = await dataSource.query(
      'SELECT email, email_confirmed_at FROM "users" WHERE email = $1',
      [SEED_ADMIN_EMAIL],
    );

    expect(afterRepair[0].email_confirmed_at).not.toBeNull();
  });
});
