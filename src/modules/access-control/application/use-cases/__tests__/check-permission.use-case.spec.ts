import { CheckPermissionUseCase } from '../check-permission.use-case';
import { IRoleRepository } from 'src/modules/access-control/domain/repositories/role.repository.interface';
import { RoleEntity } from 'src/modules/access-control/domain/entities/role.entity';
import { RoleEnum } from 'src/modules/access-control/domain/enums/role.enum';
import { ActionEnum } from 'src/core/domain/enums/action.enum';
import { SubjectEnum } from 'src/core/domain/enums/subject.enum';
import { CheckPermissionResponseDto } from '../../dtos/response/check-permission.response.dto';

describe('CheckPermissionUseCase', () => {
  let useCase: CheckPermissionUseCase;
  let roleRepository: jest.Mocked<IRoleRepository>;

  const validUuid = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    roleRepository = {
      findByUuid: jest.fn(),
      findAll: jest.fn(),
    } as unknown as jest.Mocked<IRoleRepository>;

    useCase = new CheckPermissionUseCase(roleRepository);
  });

  it('Deve retornar false se a role não existir', async () => {
    roleRepository.findByUuid.mockResolvedValue(null);

    const result = await useCase.execute({
      roleUuid: validUuid,
      permissions: [
        {
          action: ActionEnum.CREATE,
          subject: SubjectEnum.ROLE,
        },
      ],
    });

    expect(result).toBeInstanceOf(CheckPermissionResponseDto);
    expect(result.allowed).toBe(false);
  });

  it('Deve retornar true se a role tiver permissão', async () => {
    const role = RoleEntity.create({
      name: RoleEnum.USER,
    });

    jest.spyOn(role, 'hasPermission').mockReturnValue(true);

    roleRepository.findByUuid.mockResolvedValue(role);

    const result = await useCase.execute({
      roleUuid: validUuid,
      permissions: [
        {
          action: ActionEnum.CREATE,
          subject: SubjectEnum.ROLE,
        },
      ],
    });

    expect(result.allowed).toBe(true);
  });

  it('Deve retornar false se a role não tiver permissão', async () => {
    const role = RoleEntity.create({
      name: RoleEnum.USER,
    });

    jest.spyOn(role, 'hasPermission').mockReturnValue(false);

    roleRepository.findByUuid.mockResolvedValue(role);

    const result = await useCase.execute({
      roleUuid: validUuid,
      permissions: [
        {
          action: ActionEnum.CREATE,
          subject: SubjectEnum.ROLE,
        },
      ],
    });

    expect(result.allowed).toBe(false);
  });
});
