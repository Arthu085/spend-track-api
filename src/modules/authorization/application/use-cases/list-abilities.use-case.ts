import { Inject, Injectable } from '@nestjs/common';
import { AbilityEntity } from '../../domain/entities/ability.entity';
import {
  ABILITY_REPOSITORY,
  type AbilityRepository,
} from '../../domain/repositories/ability.repository';

@Injectable()
export class ListAbilitiesUseCase {
  constructor(
    @Inject(ABILITY_REPOSITORY)
    private readonly abilityRepository: AbilityRepository,
  ) {}

  execute(): Promise<AbilityEntity[]> {
    return this.abilityRepository.findAll();
  }
}
