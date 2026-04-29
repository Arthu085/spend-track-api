import { Module } from '@nestjs/common';
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
      useClass: RoleRepository,
    },
    {
      provide: 'IRoleAbilityRepository',
      useClass: RoleAbilityRepository,
    },
    {
      provide: 'IAbilityRepository',
      useClass: AbilityRepository,
    },
    CheckPermissionUseCase,
    UpdateRoleAbilitiesUseCase,
    FindAllRoleUseCase,
    FindOneRoleUseCase,
    FindAllAbilityUseCase,
    PermissionGuard,
  ],
  exports: [CheckPermissionUseCase, 'IRoleRepository'],
})
export class AccessControlModule {}
