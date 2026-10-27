import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import type { UserEntity } from '../../../domain/entities/user.entity';
import { InactiveUserError } from '../../../domain/errors/inactive-user.error';
import { UserNotFoundError } from '../../../domain/errors/user-not-found.error';
import type { UserRepository } from '../../../domain/repositories/user.repository';
import { GetUserUseCase } from '../get-user.use-case';

describe('GetUserUseCase', () => {
  it('returns the user when found', async () => {
    const user = { uuid: 'user-1', status: RecordStatus.ACTIVE } as UserEntity;
    const findByUuid = jest.fn().mockResolvedValue(user);
    const userRepository = { findByUuid } as unknown as UserRepository;

    const useCase = new GetUserUseCase(userRepository);

    await expect(useCase.execute('user-1')).resolves.toBe(user);
    expect(findByUuid).toHaveBeenCalledWith('user-1');
  });

  it('throws InactiveUserError when the user is INACTIVE', async () => {
    const user = {
      uuid: 'user-1',
      status: RecordStatus.INACTIVE,
    } as UserEntity;

    const findByUuid = jest.fn().mockResolvedValue(user);
    const userRepository = { findByUuid } as unknown as UserRepository;

    const useCase = new GetUserUseCase(userRepository);

    await expect(useCase.execute('user-1')).rejects.toBeInstanceOf(
      InactiveUserError,
    );
  });

  it('throws UserNotFoundError when the user does not exist', async () => {
    const findByUuid = jest.fn().mockResolvedValue(null);
    const userRepository = { findByUuid } as unknown as UserRepository;

    const useCase = new GetUserUseCase(userRepository);

    await expect(useCase.execute('missing')).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
  });
});
