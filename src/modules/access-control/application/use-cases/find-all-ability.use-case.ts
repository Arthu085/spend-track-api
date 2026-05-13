import { Injectable, Inject } from '@nestjs/common';
import { IAbilityRepository } from '../../domain/repositories/ability.repository.interface';
import { FindAllAbilityResponseDto } from '../dtos/response/find-all-ability.response.dto';

@Injectable()
export class FindAllAbilityUseCase {
  constructor(
    @Inject('IAbilityRepository')
    private readonly abilityRepo: IAbilityRepository,
  ) {}

  async execute(): Promise<FindAllAbilityResponseDto[]> {
    const abilities = await this.abilityRepo.findAll();

    return abilities.map((ability) => new FindAllAbilityResponseDto(ability));
  }
}
