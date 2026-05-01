import { IRoleRepository } from 'src/modules/access-control/domain/repositories/role.repository.interface';
import { RoleEntity } from 'src/modules/access-control/domain/entities/role.entity';
import { RoleEnum } from 'src/modules/access-control/domain/enums/role.enum';
import { FindAllRoleUseCase } from '../find-all-role.use-case';
import { FindAllRoleResponseDto } from '../../dtos/response/find-all-role.respose.dto';

describe('FindAllRoleUseCase', () => {
  let useCase: FindAllRoleUseCase;
  let roleRepository: jest.Mocked<IRoleRepository>;

  beforeEach(() => {
    roleRepository = {
      findByUuid: jest.fn(),
      findAll: jest.fn(),
    } as unknown as jest.Mocked<IRoleRepository>;

    useCase = new FindAllRoleUseCase(roleRepository);
  });

  it('Deve retornar todas as funções paginadas', async () => {
    const roles = [
      RoleEntity.create({ name: RoleEnum.USER }),
      RoleEntity.create({ name: RoleEnum.ADMIN }),
    ];

    roleRepository.findAll.mockResolvedValue([roles, 2]);

    const result = await useCase.execute({
      page: 1,
      limit: 10,
    });

    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('meta');
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toBeInstanceOf(FindAllRoleResponseDto);
    expect(result.meta).toMatchObject({
      total: 2,
      page: 1,
      limit: 10,
      totalPages: 1,
    });
  });

  it('Deve retornar lista vazia', async () => {
    roleRepository.findAll.mockResolvedValue([[], 0]);

    const result = await useCase.execute({
      page: 1,
      limit: 10,
    });

    expect(result.data).toEqual([]);
    expect(result.meta.total).toBe(0);
  });
});
