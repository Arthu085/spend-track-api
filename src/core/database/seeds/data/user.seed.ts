import { ISeed } from '../interfaces/seed.interface';
import { DataSource } from 'typeorm';
import { RoleEnum } from 'src/modules/access-control/domain/enums/role.enum';
import { UserOrmEntity } from 'src/modules/user/infra/entities/user.orm.entity';
import { RoleOrmEntity } from 'src/modules/access-control/infra/entities/role.orm.entity';
import { AppNotFoundException } from 'src/core/exceptions/app-not-found.exception';
import { BcryptPasswordHasher } from 'src/core/infra/services/bcrypt-password-hasher.service';

export class UserSeed implements ISeed {
  name = 'UserSeed';

  constructor(private readonly dataSource: DataSource) {}

  async run(): Promise<void> {
    const userRepo = this.dataSource.getRepository(UserOrmEntity);
    const roleRepo = this.dataSource.getRepository(RoleOrmEntity);

    const adminRole = await roleRepo.findOne({
      where: { name: RoleEnum.ADMIN },
    });

    if (!adminRole) {
      throw new AppNotFoundException({
        message: 'Role ADMIN não encontrada. Rode a seed de roles primeiro.',
      });
    }

    const passwordHasher = new BcryptPasswordHasher();
    const hashedPassword = await passwordHasher.hash('admin123', 12);

    const users = [
      {
        fullName: 'Admin User',
        email: 'admin@gmail.com',
        password: hashedPassword,
        role: adminRole,
      },
    ];

    await userRepo.upsert(users, {
      conflictPaths: ['email'],
      skipUpdateIfNoValuesChanged: true,
    });

    console.log(`${users.length} users processadas`);
  }
}
