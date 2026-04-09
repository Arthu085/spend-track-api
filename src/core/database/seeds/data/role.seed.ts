import { RoleOrmEntity } from 'src/modules/access-control/infra/entities/role.orm.entity';
import AppDataSource from '../../data-source';
import { ISeed } from '../interfaces/seed.interface';
import { DataSource } from 'typeorm';
import { RoleEnum } from 'src/modules/access-control/domain/enums/role.enum';

export class RoleSeed implements ISeed {
  name = 'RoleSeed';

  async run(): Promise<void> {
    const dataSource: DataSource = AppDataSource;

    const repository = dataSource.getRepository(RoleOrmEntity);

    const roles = Object.values(RoleEnum).map((role) => ({
      name: role,
    }));

    await repository.upsert(roles, {
      conflictPaths: ['name'],
      skipUpdateIfNoValuesChanged: true,
    });

    console.log(`${roles.length} roles processadas`);
  }
}
