import type { AbilityEntity } from '../../../domain/entities/ability.entity';
import type { AbilityRepository } from '../../../domain/repositories/ability.repository';
import { ListAbilitiesUseCase } from '../list-abilities.use-case';

describe('ListAbilitiesUseCase', () => {
  it('delegates to the ability repository', async () => {
    const abilities = [{ uuid: 'ability-1' } as AbilityEntity];
    const findAll = jest.fn().mockResolvedValue(abilities);
    const repository = { findAll } as unknown as AbilityRepository;

    const useCase = new ListAbilitiesUseCase(repository);

    await expect(useCase.execute()).resolves.toBe(abilities);
    expect(findAll).toHaveBeenCalledTimes(1);
  });
});
