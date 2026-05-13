import { Injectable, Inject } from '@nestjs/common';
import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import { IRoleRepository } from '../../domain/repositories/role.repository.interface';
import { UpdateRoleAbilitiesRequestDto } from '../dtos/request/update-role-abilities.request.dto';
import { IRoleAbilityRepository } from '../../domain/repositories/role-ability.repository.interface';
import { AppNotFoundException } from 'src/core/exceptions/app-not-found.exception';
import { IAbilityRepository } from '../../domain/repositories/ability.repository.interface';

@Injectable()
export class UpdateRoleAbilitiesUseCase {
  constructor(
    @Inject('IRoleRepository')
    private readonly roleRepo: IRoleRepository,
    @Inject('IRoleAbilityRepository')
    private readonly roleAbilityRepo: IRoleAbilityRepository,
    @Inject('IAbilityRepository')
    private readonly abilityRepo: IAbilityRepository,
  ) {}

  async execute(
    uuid: string,
    dto: UpdateRoleAbilitiesRequestDto,
  ): Promise<void> {
    const role = await this.roleRepo.findByUuid(Uuid.from(uuid));

    if (!role) {
      throw new AppNotFoundException({ resource: 'Função', gender: 'F' });
    }

    role.ensureIsNotAdmin();

    const abilities = await this.abilityRepo.findByActionsAndSubjects(
      dto.abilities,
    );

    if (abilities.length !== dto.abilities.length) {
      throw new AppNotFoundException({
        resource: 'Alguma permissão',
        gender: 'F',
      });
    }

    const abilityIds = abilities.map((a) => a.id);

    await this.roleAbilityRepo.replaceRoleAbilities(role.id, abilityIds);
  }
}
