import type { EntityManager } from 'typeorm';
import { RoleEnum } from '@modules/authorization/domain/enums/role.enum';
import { RoleOrmEntity } from '@modules/authorization/infrastructure/persistence/entities/role.orm-entity';
import type { PasswordHasher } from '../../../application/ports/password-hasher.port';
import { UserOrmEntity } from '../../persistence/entities/user.orm-entity';
import { UsersSeeder } from '../users.seeder';

interface FakeUserRow {
  email: string;
  name: string;
  password: string;
  roles: FakeRoleRow[];
  emailConfirmedAt?: Date | null;
}

interface FakeRoleRow {
  name: RoleEnum;
}

const SEED_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: 'development',
  SEED_ADMIN_EMAIL: 'seed-admin@example.com',
  SEED_ADMIN_PASSWORD: 'Dev-password1',
};

const passwordHasher: PasswordHasher = {
  hash: jest.fn((plain: string) => Promise.resolve(`hashed:${plain}`)),
  verify: jest.fn(),
};

function buildSeeder(env: NodeJS.ProcessEnv): UsersSeeder {
  return new UsersSeeder(env, passwordHasher);
}

describe('UsersSeeder', () => {
  function buildManager(
    existingUsers: FakeUserRow[],
    existingRoles: FakeRoleRow[],
  ) {
    const userRows = [...existingUsers];

    const userFindOne = jest.fn(
      ({ where: { email } }: { where: { email: string } }) =>
        Promise.resolve(userRows.find((row) => row.email === email) ?? null),
    );

    const userCreate = jest.fn((input: Partial<FakeUserRow>) => input);

    const userSave = jest.fn((row: FakeUserRow) => {
      userRows.push(row);
      return Promise.resolve(row);
    });

    const roleFindOne = jest.fn(
      ({ where: { name } }: { where: { name: RoleEnum } }) =>
        Promise.resolve(
          existingRoles.find((role) => role.name === name) ?? null,
        ),
    );

    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === UserOrmEntity) {
          return {
            findOne: userFindOne,
            create: userCreate,
            save: userSave,
          };
        }

        if (entity === RoleOrmEntity) {
          return { findOne: roleFindOne };
        }

        throw new Error('unexpected entity requested');
      }),
    } as unknown as EntityManager;

    return { manager, userRows, userSave };
  }

  it('creates the admin seed user with a password hashed by the password hasher when its role exists', async () => {
    const { manager, userRows, userSave } = buildManager(
      [],
      [{ name: RoleEnum.ADMIN }],
    );

    await buildSeeder(SEED_ENV).run(manager);

    expect(userSave).toHaveBeenCalledTimes(1);
    expect(userRows).toHaveLength(1);
    expect(userRows[0].email).toBe('seed-admin@example.com');
    expect(userRows[0].password).toBe('hashed:Dev-password1');
  });

  it('stores and looks up the admin seed email normalized', async () => {
    const { manager, userRows } = buildManager([], [{ name: RoleEnum.ADMIN }]);

    await buildSeeder({
      ...SEED_ENV,
      SEED_ADMIN_EMAIL: 'Seed-Admin@Example.COM',
    }).run(manager);

    expect(userRows[0].email).toBe('seed-admin@example.com');
  });

  it('skips the admin seed when its email already exists and is already confirmed (idempotent)', async () => {
    const { userSave, manager } = buildManager(
      [
        {
          email: 'seed-admin@example.com',
          name: 'Admin',
          password: 'already-hashed',
          roles: [],
          emailConfirmedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
      [{ name: RoleEnum.ADMIN }],
    );

    await buildSeeder(SEED_ENV).run(manager);

    expect(userSave).not.toHaveBeenCalled();
  });

  it('repairs an existing seed row whose emailConfirmedAt is still null', async () => {
    const { userSave, userRows, manager } = buildManager(
      [
        {
          email: 'seed-admin@example.com',
          name: 'Admin',
          password: 'already-hashed',
          roles: [],
          emailConfirmedAt: null,
        },
      ],
      [{ name: RoleEnum.ADMIN }],
    );

    await buildSeeder(SEED_ENV).run(manager);

    expect(userSave).toHaveBeenCalledTimes(1);
    expect(userRows[0].emailConfirmedAt).not.toBeNull();
  });

  it('fails when the admin seed target role does not exist yet', async () => {
    const { userSave, manager } = buildManager([], []);

    await expect(buildSeeder(SEED_ENV).run(manager)).rejects.toThrow(
      'Cannot seed user "seed-admin@example.com": role "ADMIN" does not exist',
    );
    expect(userSave).not.toHaveBeenCalled();
  });

  it('skips the admin seed when SEED_ADMIN_ENABLED is false', async () => {
    const { userSave, manager } = buildManager([], [{ name: RoleEnum.ADMIN }]);

    await buildSeeder({ ...SEED_ENV, SEED_ADMIN_ENABLED: 'false' }).run(
      manager,
    );

    expect(userSave).not.toHaveBeenCalled();
  });

  it('fails when enabled without credentials', async () => {
    const { userSave, manager } = buildManager([], [{ name: RoleEnum.ADMIN }]);

    await expect(
      buildSeeder({ NODE_ENV: 'development' }).run(manager),
    ).rejects.toThrow(/SEED_ADMIN_EMAIL.*SEED_ADMIN_PASSWORD/);
    expect(userSave).not.toHaveBeenCalled();
  });

  it('does not seed the admin in production unless explicitly enabled', async () => {
    const { userSave, manager } = buildManager([], [{ name: RoleEnum.ADMIN }]);

    await buildSeeder({ NODE_ENV: 'production' }).run(manager);

    expect(userSave).not.toHaveBeenCalled();
  });

  it('rejects the known default credentials in production', async () => {
    const { userSave, manager } = buildManager([], [{ name: RoleEnum.ADMIN }]);

    await expect(
      buildSeeder({
        NODE_ENV: 'production',
        SEED_ADMIN_ENABLED: 'true',
        SEED_ADMIN_EMAIL: 'admin@email.com',
        SEED_ADMIN_PASSWORD: '12345678',
      }).run(manager),
    ).rejects.toThrow('Invalid seed admin configuration');
    expect(userSave).not.toHaveBeenCalled();
  });

  it('seeds the admin in production when enabled with strong credentials', async () => {
    const { userSave, userRows, manager } = buildManager(
      [],
      [{ name: RoleEnum.ADMIN }],
    );

    await buildSeeder({
      NODE_ENV: 'production',
      SEED_ADMIN_ENABLED: 'true',
      SEED_ADMIN_EMAIL: 'ops@company.io',
      SEED_ADMIN_PASSWORD: 'x9!Long-Unique-Secret',
    }).run(manager);

    expect(userSave).toHaveBeenCalledTimes(1);
    expect(userRows[0].email).toBe('ops@company.io');
  });

  it('exposes a stable seeder name', () => {
    expect(new UsersSeeder().name).toBe('users-seeder');
  });
});
