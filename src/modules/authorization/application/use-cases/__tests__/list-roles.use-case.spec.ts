import { mockOf } from '@test/support/mocks/mock-of';
import type { RoleEntity } from '../../../domain/entities/role.entity';
import type { RoleRepository } from '../../../domain/repositories/role.repository';
import { ListRolesUseCase } from '../list-roles.use-case';

describe('ListRolesUseCase', () => {
  it('forwards optional sorting to the repository', async () => {
    const findAll = jest.fn().mockResolvedValue([]);
    const useCase = new ListRolesUseCase(mockOf<RoleRepository>({ findAll }));

    await useCase.execute({ sortBy: 'role', sortOrder: 'DESC' });

    expect(findAll).toHaveBeenCalledWith({ sortBy: 'role', sortOrder: 'DESC' });
  });

  it('delegates to the role repository', async () => {
    const roles = [{ uuid: 'role-1' } as RoleEntity];
    const findAll = jest.fn().mockResolvedValue(roles);
    const repository = { findAll } as unknown as RoleRepository;

    const useCase = new ListRolesUseCase(repository);

    await expect(useCase.execute()).resolves.toBe(roles);
    expect(findAll).toHaveBeenCalledTimes(1);
  });
});
