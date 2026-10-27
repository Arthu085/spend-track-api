import 'tsconfig-paths/register';
import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { runSeeders } from '@core/database/seeds/run-seeders';
import { seeders } from '@core/database/seeds/seeders';
import { RoleEnum } from '@modules/authorization/domain/enums/role.enum';
import { RoleOrmEntity } from '@modules/authorization/infrastructure/persistence/entities/role.orm-entity';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';
import { publishConnection } from '../support/postgres/connection-handoff';
import {
  createSchemaDataSource,
  startEphemeralPostgres,
} from '../support/postgres/lifecycle';
import { ADMIN_CREDENTIALS, USER_CREDENTIALS } from './helpers/auth-agent';

// Beyond the seed admin (one ADMIN user), the e2e suite needs a non-admin
// actor to exercise role/ability boundaries. Kept test-only, outside `seeders`.
async function seedNonAdminTestFixture(dataSource: DataSource): Promise<void> {
  const userRepository = dataSource.getRepository(UserOrmEntity);

  const roleRepository = dataSource.getRepository(RoleOrmEntity);

  const role = await roleRepository.findOne({
    where: { name: RoleEnum.USER },
  });

  if (!role) {
    return;
  }

  const user = userRepository.create({
    name: 'User',
    email: USER_CREDENTIALS.email,
    password: await argon2.hash(USER_CREDENTIALS.password),
    emailConfirmedAt: new Date(),
    roles: [role],
  });

  await userRepository.save(user);
}

// Runs once for the whole `test:e2e` run: starts a single ephemeral Postgres
// container, migrates and seeds it, and only then hands connection details
// to each test worker through the environment (see `test/e2e/setup-env.ts`)
// — mirroring `test/integration/global-setup.ts`'s ordering, so no worker can
// start against a DB that isn't fully ready yet.
export default async function globalSetup(): Promise<void> {
  const connection = await startEphemeralPostgres('e2e');

  const dataSource = createSchemaDataSource(connection);

  await dataSource.initialize();

  // `synchronize` is off, so the suite migrates the target DB itself.
  await dataSource.runMigrations();

  process.env.SEED_ADMIN_ENABLED = 'true';
  process.env.SEED_ADMIN_EMAIL = ADMIN_CREDENTIALS.email;
  process.env.SEED_ADMIN_PASSWORD = ADMIN_CREDENTIALS.password;

  await runSeeders(dataSource, seeders);

  await seedNonAdminTestFixture(dataSource);

  await dataSource.destroy();

  publishConnection(connection);
}
