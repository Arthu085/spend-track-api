import type { TransactionManagerPort } from '@shared/application/ports';
import type { UserRepository } from '@modules/users/domain/repositories/user.repository';
import type { RefreshTokenRepository } from '../../../domain/repositories/refresh-token.repository';
import { LogoutUseCase } from '../logout.use-case';
import { buildUser } from '@test/support/builders/user.builder';
import { mockOf } from '@test/support/mocks/mock-of';

function buildUseCase(user: ReturnType<typeof buildUser> | null): {
  useCase: LogoutUseCase;
  findByUuidForUpdate: jest.Mock;
  revokeAllForUser: jest.Mock;
  runInTransaction: jest.Mock;
} {
  const findByUuidForUpdate = jest.fn().mockResolvedValue(user);
  const revokeAllForUser = jest.fn().mockResolvedValue(undefined);

  const runInTransaction = jest
    .fn()
    .mockImplementation((work: () => Promise<unknown>) => work());

  const useCase = new LogoutUseCase(
    mockOf<UserRepository>({ findByUuidForUpdate }),
    mockOf<RefreshTokenRepository>({ revokeAllForUser }),
    mockOf<TransactionManagerPort>({ runInTransaction }),
  );

  return { useCase, findByUuidForUpdate, revokeAllForUser, runInTransaction };
}

describe('LogoutUseCase', () => {
  it('revokes every refresh token for the user while holding the user row lock', async () => {
    const user = buildUser();

    const { useCase, findByUuidForUpdate, revokeAllForUser, runInTransaction } =
      buildUseCase(user);

    await useCase.execute({ userUuid: 'user-uuid' });

    expect(runInTransaction).toHaveBeenCalledTimes(1);
    expect(findByUuidForUpdate).toHaveBeenCalledWith('user-uuid');
    expect(revokeAllForUser).toHaveBeenCalledWith(user.id);
    expect(findByUuidForUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      revokeAllForUser.mock.invocationCallOrder[0],
    );
  });

  it('is a no-op (not a throw) when the user no longer exists', async () => {
    const { useCase, revokeAllForUser } = buildUseCase(null);

    await expect(
      useCase.execute({ userUuid: 'missing-uuid' }),
    ).resolves.toBeUndefined();
    expect(revokeAllForUser).not.toHaveBeenCalled();
  });
});
