import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RoleRepository } from './infra/repositories/role.repository';
import { RoleAbilityRepository } from './infra/repositories/role-ability.repository';
import { CheckPermissionUseCase } from './application/use-cases/check-permission.use-case';
import { UpdateRoleAbilitiesUseCase } from './application/use-cases/update-role-abilities.use-case';
import { PermissionGuard } from './presentation/guards/permission.guard';
import { RoleController } from './presentation/controllers/role.controller';
import { FindAllRoleUseCase } from './application/use-cases/find-all-role.use-case';

@Module({
  controllers: [RoleController],
  providers: [
    {
      provide: 'IRoleRepository',
      useFactory: (dataSource: DataSource) => new RoleRepository(dataSource),
      inject: [DataSource],
    },
    {
      provide: 'IRoleAbilityRepository',
      useFactory: (dataSource: DataSource) =>
        new RoleAbilityRepository(dataSource),
      inject: [DataSource],
    },
    {
      provide: CheckPermissionUseCase,
      useFactory: (roleRepo) => new CheckPermissionUseCase(roleRepo),
      inject: ['IRoleRepository'],
    },
    {
      provide: UpdateRoleAbilitiesUseCase,
      useFactory: (roleRepo, roleAbilityRepo) =>
        new UpdateRoleAbilitiesUseCase(roleRepo, roleAbilityRepo),
      inject: ['IRoleRepository', 'IRoleAbilityRepository'],
    },
    {
      provide: FindAllRoleUseCase,
      useFactory: (roleRepo) => new FindAllRoleUseCase(roleRepo),
      inject: ['IRoleRepository'],
    },
    PermissionGuard,
  ],
  exports: [CheckPermissionUseCase],
})
export class AccessControlModule {}
