import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import { IRoleRepository } from '../../domain/repositories/role.repository.interface';
import { UpdateRoleAbilitiesRequestDto } from '../dtos/request/update-role-abilities.request.dto';
import { IRoleAbilityRepository } from '../../domain/repositories/role-ability.repository.interface';
import { AppNotFoundException } from 'src/core/exceptions/app-not-found.execption';

export class UpdateRoleAbilitiesUseCase {
  constructor(
    private readonly roleRepo: IRoleRepository,
    private readonly roleAbilityRepo: IRoleAbilityRepository,
  ) {}

  async execute(
    uuid: string,
    dto: UpdateRoleAbilitiesRequestDto,
  ): Promise<void> {
    const params = {
      ...dto,
      roleUuid: Uuid.from(uuid),
    };

    const role = await this.roleRepo.findByUuid(params.roleUuid);

    if (!role) {
      throw new AppNotFoundException({ resource: 'Função', gender: 'F' });
    }

    await this.roleAbilityRepo.replaceRoleAbilities(role.id, params.abilityIds);
  }
}
