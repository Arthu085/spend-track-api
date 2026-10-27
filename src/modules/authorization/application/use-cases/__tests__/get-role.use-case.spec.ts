import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import type { RoleEntity } from '../../../domain/entities/role.entity';
import { InactiveRoleError } from '../../../domain/errors/inactive-role.error';
import { RoleNotFoundError } from '../../../domain/errors/role-not-found.error';
import type { RoleRepository } from '../../../domain/repositories/role.repository';
import { GetRoleUseCase } from '../get-role.use-case';

describe('GetRoleUseCase', () => {
  it('returns the role when found', async () => {
    const role = { uuid: 'role-1', status: RecordStatus.ACTIVE } as RoleEntity;
    const findByUuid = jest.fn().mockResolvedValue(role);
    const repository = { findByUuid } as unknown as RoleRepository;

    const useCase = new GetRoleUseCase(repository);

    await expect(useCase.execute('role-1')).resolves.toBe(role);
    expect(findByUuid).toHaveBeenCalledWith('role-1');
  });

  it('throws InactiveRoleError when the role is INACTIVE', async () => {
    const role = {
      uuid: 'role-1',
      status: RecordStatus.INACTIVE,
    } as RoleEntity;

    const findByUuid = jest.fn().mockResolvedValue(role);
    const repository = { findByUuid } as unknown as RoleRepository;

    const useCase = new GetRoleUseCase(repository);

    await expect(useCase.execute('role-1')).rejects.toBeInstanceOf(
      InactiveRoleError,
    );
  });

  it('throws RoleNotFoundError when the role does not exist', async () => {
    const findByUuid = jest.fn().mockResolvedValue(null);
    const repository = { findByUuid } as unknown as RoleRepository;

    const useCase = new GetRoleUseCase(repository);

    await expect(useCase.execute('missing')).rejects.toBeInstanceOf(
      RoleNotFoundError,
    );
  });
});
