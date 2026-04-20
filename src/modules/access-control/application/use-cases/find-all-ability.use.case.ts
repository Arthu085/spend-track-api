import { IAbilityRepository } from '../../domain/repositories/ability.repository.interface';
import { FindAllAbilityResponseDto } from '../dtos/response/find-all-ability.response.dto';

export class FindAllAbilityUseCase {
  constructor(private readonly abilityRepo: IAbilityRepository) {}

  async execute(): Promise<FindAllAbilityResponseDto[]> {
    const abilities = await this.abilityRepo.findAll();

    return abilities.map((ability) => new FindAllAbilityResponseDto(ability));
  }
}
