import { RoleOrmEntity } from 'src/modules/access-control/infra/entities/role.orm.entity';
import AppDataSource from '../../data-source';
import { ISeed } from '../interfaces/seed.interface';
import { DataSource } from 'typeorm';
import { RoleEnum } from 'src/modules/access-control/domain/enums/role.enum';

export class RoleSeed implements ISeed {
  name = 'RoleSeed';

  constructor(private readonly dataSource: DataSource) {}

  async run(): Promise<void> {
    const repository = this.dataSource.getRepository(RoleOrmEntity);

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
