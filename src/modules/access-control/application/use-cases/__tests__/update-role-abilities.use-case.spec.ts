import { RoleEntity } from 'src/modules/access-control/domain/entities/role.entity';
import { RoleEnum } from 'src/modules/access-control/domain/enums/role.enum';
import { UpdateRoleAbilitiesUseCase } from '../update-role-abilities.use-case';
import { IRoleRepository } from 'src/modules/access-control/domain/repositories/role.repository.interface';
import { IRoleAbilityRepository } from 'src/modules/access-control/domain/repositories/role-ability.repository.interface';
import { IAbilityRepository } from 'src/modules/access-control/domain/repositories/ability.repository.interface';
import { AppNotFoundException } from 'src/core/exceptions/app-not-found.exception';
import { DomainConflictException } from 'src/core/domain/exceptions/domain-conflict.exception';
import { ActionEnum } from 'src/core/domain/enums/action.enum';
import { SubjectEnum } from 'src/core/domain/enums/subject.enum';
import { AbilityEntity } from 'src/modules/access-control/domain/entities/ability.entity';

describe('UpdateRoleAbilitiesUseCase', () => {
  let useCase: UpdateRoleAbilitiesUseCase;
  let roleRepository: jest.Mocked<IRoleRepository>;
  let roleAbilityRepository: jest.Mocked<IRoleAbilityRepository>;
  let abilityRepository: jest.Mocked<IAbilityRepository>;

  beforeEach(() => {
    roleRepository = {
      findByUuid: jest.fn(),
      findAll: jest.fn(),
    } as unknown as jest.Mocked<IRoleRepository>;

    roleAbilityRepository = {
      replaceRoleAbilities: jest.fn(),
    } as unknown as jest.Mocked<IRoleAbilityRepository>;

    abilityRepository = {
      findAll: jest.fn(),
      findByActionsAndSubjects: jest.fn(),
    } as unknown as jest.Mocked<IAbilityRepository>;

    useCase = new UpdateRoleAbilitiesUseCase(
      roleRepository,
      roleAbilityRepository,
      abilityRepository,
    );
  });

  const validUuid = '550e8400-e29b-41d4-a716-446655440000';

  it('Não deve permitir alterar função ADMIN', async () => {
    const role = RoleEntity.create({
      name: RoleEnum.ADMIN,
    });

    roleRepository.findByUuid.mockResolvedValue(role);

    await expect(
      useCase.execute(validUuid, {
        abilities: [],
      }),
    ).rejects.toThrow(DomainConflictException);
  });

  it('Deve lançar erro se role não existir', async () => {
    roleRepository.findByUuid.mockResolvedValue(null);

    await expect(
      useCase.execute(validUuid, {
        abilities: [],
      }),
    ).rejects.toThrow(AppNotFoundException);
  });

  it('Deve lançar erro se alguma ability não existir', async () => {
    const role = RoleEntity.create({ name: RoleEnum.USER });

    roleRepository.findByUuid.mockResolvedValue(role);

    abilityRepository.findByActionsAndSubjects.mockResolvedValue([]);

    await expect(
      useCase.execute(validUuid, {
        abilities: [{ action: ActionEnum.READ, subject: SubjectEnum.ROLE }],
      }),
    ).rejects.toThrow(AppNotFoundException);
  });

  it('Deve atualizar abilities com sucesso', async () => {
    const role = RoleEntity.create({ name: RoleEnum.USER });

    roleRepository.findByUuid.mockResolvedValue(role);

    const abilities = [
      AbilityEntity.create({
        action: ActionEnum.CREATE,
        subject: SubjectEnum.ROLE,
      }),
      AbilityEntity.create({
        action: ActionEnum.UPDATE,
        subject: SubjectEnum.ROLE,
      }),
    ];

    abilityRepository.findByActionsAndSubjects.mockResolvedValue(abilities);

    await expect(
      useCase.execute(validUuid, {
        abilities: [
          { action: ActionEnum.CREATE, subject: SubjectEnum.ROLE },
          { action: ActionEnum.UPDATE, subject: SubjectEnum.ROLE },
        ],
      }),
    ).resolves.toBeUndefined();

    expect(
      jest.spyOn(roleAbilityRepository, 'replaceRoleAbilities'),
    ).toHaveBeenCalled();
  });
});
