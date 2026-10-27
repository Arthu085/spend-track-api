import type { UserAbilityRepository } from '@modules/authorization';
import { Subject } from '@shared/domain/authorization/subject';
import { Action } from '@shared/domain/enums/action.enum';
import { mockOf } from '@test/support/mocks/mock-of';
import { ListOwnAbilitiesUseCase } from '../list-own-abilities.use-case';

describe('ListOwnAbilitiesUseCase', () => {
  it("returns the actor's granted ability pairs", async () => {
    const granted = [
      { action: Action.READ, subject: Subject.USER },
      { action: Action.UPDATE, subject: Subject.ROLE },
    ];

    const findGrantedAbilities = jest.fn().mockResolvedValue(granted);

    const useCase = new ListOwnAbilitiesUseCase(
      mockOf<UserAbilityRepository>({ findGrantedAbilities }),
    );

    await expect(useCase.execute('actor-1')).resolves.toEqual(granted);
    expect(findGrantedAbilities).toHaveBeenCalledWith('actor-1');
  });
});
