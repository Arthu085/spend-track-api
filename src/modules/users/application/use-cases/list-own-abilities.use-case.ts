import { Inject, Injectable } from '@nestjs/common';
import {
  USER_ABILITY_REPOSITORY,
  type UserAbilityRepository,
} from '@modules/authorization';
import type { AbilityPair } from '@shared/domain/authorization/ability-pair.type';

@Injectable()
export class ListOwnAbilitiesUseCase {
  constructor(
    @Inject(USER_ABILITY_REPOSITORY)
    private readonly userAbilityRepository: UserAbilityRepository,
  ) {}

  execute(actorUuid: string): Promise<AbilityPair[]> {
    return this.userAbilityRepository.findGrantedAbilities(actorUuid);
  }
}
