import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { RoleEnum } from '@modules/authorization/domain/enums/role.enum';
import { RoleOrmEntity } from '@modules/authorization/infrastructure/persistence/entities/role.orm-entity';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';
import type { Credentials } from './auth-agent';

// Logout and refresh-token reuse end every session of the user, access tokens included. Spec files
// run in parallel against one database, so a test that does either must not sign out the shared
// seed accounts other suites are using: it signs in as a confirmed USER of its own instead.
export async function createIsolatedUser(
  app: INestApplication,
): Promise<Credentials> {
  const dataSource = app.get<DataSource>(getDataSourceToken());

  const role = await dataSource
    .getRepository(RoleOrmEntity)
    .findOneOrFail({ where: { name: RoleEnum.USER } });

  const credentials: Credentials = {
    email: `isolated-${randomUUID()}@example.com`,
    password: 'StrongPass123!',
  };

  const userRepository = dataSource.getRepository(UserOrmEntity);

  await userRepository.save(
    userRepository.create({
      name: 'Isolated User',
      email: credentials.email,
      password: await argon2.hash(credentials.password),
      emailConfirmedAt: new Date(),
      roles: [role],
    }),
  );

  return credentials;
}
