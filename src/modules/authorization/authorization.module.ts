import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GetRoleUseCase } from './application/use-cases/get-role.use-case';
import { ListAbilitiesUseCase } from './application/use-cases/list-abilities.use-case';
import { ListRolesUseCase } from './application/use-cases/list-roles.use-case';
import { UpdateRoleAbilitiesUseCase } from './application/use-cases/update-role-abilities.use-case';
import { ABILITY_REPOSITORY } from './domain/repositories/ability.repository';
import { ROLE_REPOSITORY } from './domain/repositories/role.repository';
import { USER_ABILITY_REPOSITORY } from './domain/repositories/user-ability.repository';
import { AbilityOrmEntity } from './infrastructure/persistence/entities/ability.orm-entity';
import { RoleOrmEntity } from './infrastructure/persistence/entities/role.orm-entity';
import { TypeOrmAbilityRepository } from './infrastructure/persistence/repositories/typeorm-ability.repository';
import { TypeOrmRoleRepository } from './infrastructure/persistence/repositories/typeorm-role.repository';
import { TypeOrmUserAbilityRepository } from './infrastructure/persistence/repositories/typeorm-user-ability.repository';
import { AbilitiesController } from './presentation/controllers/abilities.controller';
import { RolesController } from './presentation/controllers/roles.controller';
import { AbilitiesGuard } from './presentation/guards/abilities.guard';

@Module({
  imports: [TypeOrmModule.forFeature([RoleOrmEntity, AbilityOrmEntity])],
  controllers: [RolesController, AbilitiesController],
  providers: [
    { provide: ROLE_REPOSITORY, useClass: TypeOrmRoleRepository },
    { provide: ABILITY_REPOSITORY, useClass: TypeOrmAbilityRepository },
    {
      provide: USER_ABILITY_REPOSITORY,
      useClass: TypeOrmUserAbilityRepository,
    },
    ListRolesUseCase,
    GetRoleUseCase,
    UpdateRoleAbilitiesUseCase,
    ListAbilitiesUseCase,
    AbilitiesGuard,
  ],
  exports: [
    ROLE_REPOSITORY,
    ABILITY_REPOSITORY,
    USER_ABILITY_REPOSITORY,
    AbilitiesGuard,
  ],
})
export class AuthorizationModule {}
