import { EntityManager } from 'typeorm';
import { seedAdminValidationSchema } from '@core/config/validation/seed-admin.validation';
import { Seeder } from '@core/database/seeds/seeder.interface';
import { RoleEnum } from '@modules/authorization';
import { normalizeEmail } from '@shared/application/filters';
import { RoleOrmEntity } from '@modules/authorization/persistence';
import { PasswordHasher } from '../../application/ports/password-hasher.port';
import { Argon2PasswordHasher } from '../hashing/argon2-password-hasher';
import { UserOrmEntity } from '../persistence/entities/user.orm-entity';

interface UserDefinition {
  name: string;
  email: string;
  password: string;
  roleKey: RoleEnum;
  emailConfirmedAt: Date;
}

function resolveSeedUsers(env: NodeJS.ProcessEnv): UserDefinition[] {
  const result = seedAdminValidationSchema.validate(env, {
    allowUnknown: true,
    abortEarly: false,
  });

  if (result.error) {
    throw new Error(
      `Invalid seed admin configuration: ${result.error.message}`,
    );
  }

  const value = result.value;

  if (!value.SEED_ADMIN_ENABLED) {
    return [];
  }

  return [
    {
      name: 'Admin',
      email: normalizeEmail(value.SEED_ADMIN_EMAIL!),
      password: value.SEED_ADMIN_PASSWORD!,
      roleKey: RoleEnum.ADMIN,
      emailConfirmedAt: new Date(),
    },
  ];
}

export class UsersSeeder implements Seeder {
  readonly name = 'users-seeder';

  constructor(
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly passwordHasher: PasswordHasher = new Argon2PasswordHasher(),
  ) {}

  async run(manager: EntityManager): Promise<void> {
    const seedUsers = resolveSeedUsers(this.env);

    if (seedUsers.length === 0) {
      return;
    }

    const userRepository = manager.getRepository(UserOrmEntity);
    const roleRepository = manager.getRepository(RoleOrmEntity);

    for (const definition of seedUsers) {
      const existing = await userRepository.findOne({
        where: { email: definition.email },
      });

      if (existing) {
        if (!existing.emailConfirmedAt) {
          existing.emailConfirmedAt = definition.emailConfirmedAt;
          await userRepository.save(existing);
        }

        continue;
      }

      const role = await roleRepository.findOne({
        where: { name: definition.roleKey },
      });

      if (!role) {
        throw new Error(
          `Cannot seed user "${definition.email}": role "${definition.roleKey}" does not exist`,
        );
      }

      const hashedPassword = await this.passwordHasher.hash(
        definition.password,
      );

      const user = userRepository.create({
        name: definition.name,
        email: definition.email,
        password: hashedPassword,
        emailConfirmedAt: definition.emailConfirmedAt,
        roles: [role],
      });

      await userRepository.save(user);
    }
  }
}
