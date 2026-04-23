import { IRoleRepository } from 'src/modules/access-control/domain/repositories/role.repository.interface';
import { FindOneRoleUseCase } from '../find-one-role.use.case';
import { RoleEntity } from 'src/modules/access-control/domain/entities/role.entity';
import { RoleEnum } from 'src/modules/access-control/domain/enums/role.enum';
import { FindOneRoleResponseDto } from '../../dtos/response/find-one-role.response.dto';
import { AppNotFoundException } from 'src/core/exceptions/app-not-found.exception';

describe('FindOneRoleUseCase', () => {
  let useCase: FindOneRoleUseCase;
  let roleRepository: jest.Mocked<IRoleRepository>;

  beforeEach(() => {
    roleRepository = {
      findByUuid: jest.fn(),
      findAll: jest.fn(),
    } as unknown as jest.Mocked<IRoleRepository>;

    useCase = new FindOneRoleUseCase(roleRepository);
  });

  const validUuid = '550e8400-e29b-41d4-a716-446655440000';

  it('Deve retornar uma função existente', async () => {
    const role = RoleEntity.create({
      name: RoleEnum.USER,
    });

    roleRepository.findByUuid.mockResolvedValue(role);

    const result = await useCase.execute(validUuid);

    expect(result).toBeInstanceOf(FindOneRoleResponseDto);
    expect(result).toMatchObject({
      name: role.name,
    });
  });

  it('Deve lançar erro se role não existir', async () => {
    roleRepository.findByUuid.mockResolvedValue(null);

    await expect(useCase.execute(validUuid)).rejects.toThrow(
      AppNotFoundException,
    );
  });
});
