import { FindAllAbilityUseCase } from '../find-all-ability.use.case';
import { IAbilityRepository } from 'src/modules/access-control/domain/repositories/ability.repository.interface';
import { AbilityEntity } from 'src/modules/access-control/domain/entities/ability.entity';
import { ActionEnum } from 'src/modules/access-control/domain/enums/action.enum';
import { SubjectEnum } from 'src/modules/access-control/domain/enums/subject.enum';
import { FindAllAbilityResponseDto } from '../../dtos/response/find-all-ability.response.dto';

describe('FindAllAbilityUseCase', () => {
  let useCase: FindAllAbilityUseCase;
  let abilityRepository: jest.Mocked<IAbilityRepository>;

  beforeEach(() => {
    abilityRepository = {
      findAll: jest.fn(),
      findByActionsAndSubjects: jest.fn(),
    } as unknown as jest.Mocked<IAbilityRepository>;

    useCase = new FindAllAbilityUseCase(abilityRepository);
  });

  it('Deve retornar todas as habilidades', async () => {
    const abilities = [
      AbilityEntity.create({
        action: ActionEnum.CREATE,
        subject: SubjectEnum.ROLE,
      }),
      AbilityEntity.create({
        action: ActionEnum.READ,
        subject: SubjectEnum.ROLE,
      }),
    ];

    abilityRepository.findAll.mockResolvedValue(abilities);

    const result = await useCase.execute();

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0]).toBeInstanceOf(FindAllAbilityResponseDto);
    expect(result[0]).toMatchObject({
      action: ActionEnum.CREATE,
      subject: SubjectEnum.ROLE,
    });
  });

  it('Deve retornar lista vazia', async () => {
    abilityRepository.findAll.mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result).toEqual([]);
  });
});
