import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RoleRepository } from './infra/repositories/role.repository';
import { RoleAbilityRepository } from './infra/repositories/role-ability.repository';
import { CheckPermissionUseCase } from './application/use-cases/check-permission.use-case';
import { UpdateRoleAbilitiesUseCase } from './application/use-cases/update-role-abilities.use-case';
import { PermissionGuard } from './presentation/guards/permission.guard';
import { RoleController } from './presentation/controllers/role.controller';
import { FindAllRoleUseCase } from './application/use-cases/find-all-role.use-case';
import { FindOneRoleUseCase } from './application/use-cases/find-one-role.use.case';
import { AbilityRepository } from './infra/repositories/ability.repository';
import { AbilityController } from './presentation/controllers/ability.controller';
import { FindAllAbilityUseCase } from './application/use-cases/find-all-ability.use.case';

@Module({
  controllers: [RoleController, AbilityController],
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
      provide: 'IAbilityRepository',
      useFactory: (dataSource: DataSource) => new AbilityRepository(dataSource),
      inject: [DataSource],
    },
    {
      provide: CheckPermissionUseCase,
      useFactory: (roleRepo) => new CheckPermissionUseCase(roleRepo),
      inject: ['IRoleRepository'],
    },
    {
      provide: UpdateRoleAbilitiesUseCase,
      useFactory: (roleRepo, roleAbilityRepo, abilityRepo) =>
        new UpdateRoleAbilitiesUseCase(roleRepo, roleAbilityRepo, abilityRepo),
      inject: [
        'IRoleRepository',
        'IRoleAbilityRepository',
        'IAbilityRepository',
      ],
    },
    {
      provide: FindAllRoleUseCase,
      useFactory: (roleRepo) => new FindAllRoleUseCase(roleRepo),
      inject: ['IRoleRepository'],
    },
    {
      provide: FindOneRoleUseCase,
      useFactory: (roleRepo) => new FindOneRoleUseCase(roleRepo),
      inject: ['IRoleRepository'],
    },
    {
      provide: FindAllAbilityUseCase,
      useFactory: (abilityRepo) => new FindAllAbilityUseCase(abilityRepo),
      inject: ['IAbilityRepository'],
    },
    PermissionGuard,
  ],
  exports: [CheckPermissionUseCase],
})
export class AccessControlModule {}
