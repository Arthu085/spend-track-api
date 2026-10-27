import type { TransactionManagerPort } from '@shared/application/ports';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import type { UserRepository } from '@modules/users/domain/repositories/user.repository';
import type { PasswordHasher } from '@modules/users/application/ports/password-hasher.port';
import { EmailNotConfirmedError } from '../../../domain/errors/email-not-confirmed.error';
import { InvalidCredentialsError } from '../../../domain/errors/invalid-credentials.error';
import { UserInactiveError } from '../../../domain/errors/user-inactive.error';
import type { IssueAuthTokensService } from '../../services/issue-auth-tokens.service';
import { LoginUseCase } from '../login.use-case';
import { buildUser } from '@test/support/builders/user.builder';
import { mockOf } from '@test/support/mocks/mock-of';

function buildTransactionManager(): TransactionManagerPort {
  return mockOf<TransactionManagerPort>({
    runInTransaction: jest
      .fn()
      .mockImplementation((work: () => Promise<unknown>) => work()),
  });
}

describe('LoginUseCase', () => {
  const input = { email: 'jane@example.com', password: 'plain-password' };

  it('throws InvalidCredentialsError when no user matches the email, after verifying the password against a dummy hash', async () => {
    const findByEmail = jest.fn().mockResolvedValue(null);
    const userRepository = mockOf<UserRepository>({ findByEmail });
    const hash = jest.fn().mockResolvedValue('dummy-hash');
    const verify = jest.fn().mockResolvedValue(false);
    const passwordHasher = mockOf<PasswordHasher>({ hash, verify });
    const issue = jest.fn();
    const issueAuthTokens = mockOf<IssueAuthTokensService>({ issue });

    const useCase = new LoginUseCase(
      userRepository,
      passwordHasher,
      issueAuthTokens,
      buildTransactionManager(),
    );

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledWith('dummy-hash', input.password);
    expect(issue).not.toHaveBeenCalled();
  });

  it('throws InvalidCredentialsError for an unknown email even if the dummy hash happens to verify', async () => {
    const findByEmail = jest.fn().mockResolvedValue(null);
    const userRepository = mockOf<UserRepository>({ findByEmail });
    const hash = jest.fn().mockResolvedValue('dummy-hash');
    const verify = jest.fn().mockResolvedValue(true);
    const passwordHasher = mockOf<PasswordHasher>({ hash, verify });
    const issue = jest.fn();
    const issueAuthTokens = mockOf<IssueAuthTokensService>({ issue });

    const useCase = new LoginUseCase(
      userRepository,
      passwordHasher,
      issueAuthTokens,
      buildTransactionManager(),
    );

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
    expect(issue).not.toHaveBeenCalled();
  });

  it('looks up the user by the normalized email so a mixed-case login matches the stored account', async () => {
    const user = buildUser();
    const findByEmail = jest.fn().mockResolvedValue(user);
    const findByIdForUpdate = jest.fn().mockResolvedValue(user);

    const userRepository = mockOf<UserRepository>({
      findByEmail,
      findByIdForUpdate,
    });

    const verify = jest.fn().mockResolvedValue(true);
    const passwordHasher = mockOf<PasswordHasher>({ verify });

    const issue = jest.fn().mockResolvedValue({
      user,
      accessToken: 'access',
      refreshToken: 'refresh',
      sessionId: 'new-session',
    });

    const issueAuthTokens = mockOf<IssueAuthTokensService>({ issue });

    const useCase = new LoginUseCase(
      userRepository,
      passwordHasher,
      issueAuthTokens,
      buildTransactionManager(),
    );

    const result = await useCase.execute({
      ...input,
      email: '  Jane@Example.COM ',
    });

    expect(findByEmail).toHaveBeenCalledWith('jane@example.com');
    // No session id is passed, so every login starts a new session.
    expect(issue).toHaveBeenCalledWith(user);
    expect(result.sessionId).toBe('new-session');
  });

  it('computes the dummy hash once at module init and reuses it across unknown-email attempts', async () => {
    const findByEmail = jest.fn().mockResolvedValue(null);
    const userRepository = mockOf<UserRepository>({ findByEmail });
    const hash = jest.fn().mockResolvedValue('dummy-hash');
    const verify = jest.fn().mockResolvedValue(false);
    const passwordHasher = mockOf<PasswordHasher>({ hash, verify });

    const issueAuthTokens = mockOf<IssueAuthTokensService>({
      issue: jest.fn(),
    });

    const useCase = new LoginUseCase(
      userRepository,
      passwordHasher,
      issueAuthTokens,
      buildTransactionManager(),
    );

    await useCase.onModuleInit();
    expect(hash).toHaveBeenCalledTimes(1);

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
    await expect(useCase.execute(input)).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );

    expect(hash).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledTimes(2);
  });

  it('throws InvalidCredentialsError when the password does not match', async () => {
    const user = buildUser();
    const findByEmail = jest.fn().mockResolvedValue(user);
    const userRepository = mockOf<UserRepository>({ findByEmail });
    const verify = jest.fn().mockResolvedValue(false);
    const passwordHasher = mockOf<PasswordHasher>({ verify });
    const issue = jest.fn();
    const issueAuthTokens = mockOf<IssueAuthTokensService>({ issue });

    const useCase = new LoginUseCase(
      userRepository,
      passwordHasher,
      issueAuthTokens,
      buildTransactionManager(),
    );

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
    expect(verify).toHaveBeenCalledWith(user.password, input.password);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(issue).not.toHaveBeenCalled();
  });

  it('throws InvalidCredentialsError (never EmailNotConfirmedError) when the password is wrong on an unconfirmed account — never turns login into an account-existence oracle', async () => {
    const unconfirmedUser = buildUser({ emailConfirmedAt: null });
    const findByEmail = jest.fn().mockResolvedValue(unconfirmedUser);
    const userRepository = mockOf<UserRepository>({ findByEmail });
    const verify = jest.fn().mockResolvedValue(false);
    const passwordHasher = mockOf<PasswordHasher>({ verify });
    const issue = jest.fn();
    const issueAuthTokens = mockOf<IssueAuthTokensService>({ issue });

    const useCase = new LoginUseCase(
      userRepository,
      passwordHasher,
      issueAuthTokens,
      buildTransactionManager(),
    );

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
    expect(issue).not.toHaveBeenCalled();
  });

  it('throws UserInactiveError when credentials are valid but the user is INACTIVE', async () => {
    const user = buildUser({ status: RecordStatus.INACTIVE });
    const findByEmail = jest.fn().mockResolvedValue(user);
    const userRepository = mockOf<UserRepository>({ findByEmail });
    const verify = jest.fn().mockResolvedValue(true);
    const passwordHasher = mockOf<PasswordHasher>({ verify });
    const issue = jest.fn();
    const issueAuthTokens = mockOf<IssueAuthTokensService>({ issue });

    const useCase = new LoginUseCase(
      userRepository,
      passwordHasher,
      issueAuthTokens,
      buildTransactionManager(),
    );

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(
      UserInactiveError,
    );
    expect(issue).not.toHaveBeenCalled();
  });

  it('throws UserInactiveError (never EmailNotConfirmedError) when the account is both inactive and unconfirmed — inactive wins', async () => {
    const user = buildUser({
      status: RecordStatus.INACTIVE,
      emailConfirmedAt: null,
    });

    const findByEmail = jest.fn().mockResolvedValue(user);
    const userRepository = mockOf<UserRepository>({ findByEmail });
    const verify = jest.fn().mockResolvedValue(true);
    const passwordHasher = mockOf<PasswordHasher>({ verify });
    const issue = jest.fn();
    const issueAuthTokens = mockOf<IssueAuthTokensService>({ issue });

    const useCase = new LoginUseCase(
      userRepository,
      passwordHasher,
      issueAuthTokens,
      buildTransactionManager(),
    );

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(
      UserInactiveError,
    );
    expect(issue).not.toHaveBeenCalled();
  });

  it('throws EmailNotConfirmedError when credentials are valid, the user is ACTIVE, but the email was never confirmed', async () => {
    const user = buildUser({ emailConfirmedAt: null });
    const findByEmail = jest.fn().mockResolvedValue(user);
    const userRepository = mockOf<UserRepository>({ findByEmail });
    const verify = jest.fn().mockResolvedValue(true);
    const passwordHasher = mockOf<PasswordHasher>({ verify });
    const issue = jest.fn();
    const issueAuthTokens = mockOf<IssueAuthTokensService>({ issue });

    const useCase = new LoginUseCase(
      userRepository,
      passwordHasher,
      issueAuthTokens,
      buildTransactionManager(),
    );

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(
      EmailNotConfirmedError,
    );
    expect(issue).not.toHaveBeenCalled();
  });

  it('issues auth tokens for a valid, active, confirmed user', async () => {
    const user = buildUser();
    const findByEmail = jest.fn().mockResolvedValue(user);
    const findByIdForUpdate = jest.fn().mockResolvedValue(user);

    const userRepository = mockOf<UserRepository>({
      findByEmail,
      findByIdForUpdate,
    });

    const verify = jest.fn().mockResolvedValue(true);
    const passwordHasher = mockOf<PasswordHasher>({ verify });

    const issue = jest.fn().mockResolvedValue({
      user,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      refreshTokenUuid: 'jti-1',
    });

    const issueAuthTokens = mockOf<IssueAuthTokensService>({ issue });

    const useCase = new LoginUseCase(
      userRepository,
      passwordHasher,
      issueAuthTokens,
      buildTransactionManager(),
    );

    const result = await useCase.execute(input);

    expect(issue).toHaveBeenCalledWith(user);
    expect(result).toEqual({
      user,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
  });

  it('issues the tokens for the user re-read under its row lock', async () => {
    const user = buildUser();
    const lockedUser = buildUser({ name: 'Locked Re-read' });
    const findByEmail = jest.fn().mockResolvedValue(user);
    const findByIdForUpdate = jest.fn().mockResolvedValue(lockedUser);

    const userRepository = mockOf<UserRepository>({
      findByEmail,
      findByIdForUpdate,
    });

    const verify = jest.fn().mockResolvedValue(true);
    const passwordHasher = mockOf<PasswordHasher>({ verify });
    const issue = jest.fn().mockResolvedValue({ user: lockedUser });
    const issueAuthTokens = mockOf<IssueAuthTokensService>({ issue });

    const useCase = new LoginUseCase(
      userRepository,
      passwordHasher,
      issueAuthTokens,
      buildTransactionManager(),
    );

    await useCase.execute(input);

    expect(findByIdForUpdate).toHaveBeenCalledWith(user.id);
    expect(issue).toHaveBeenCalledWith(lockedUser);
  });

  it.each([
    [
      'deactivated',
      buildUser({ status: RecordStatus.INACTIVE }),
      UserInactiveError,
    ],
    ['deleted', null, InvalidCredentialsError],
    [
      'given a new password',
      buildUser({ password: 'hash-of-a-newer-password' }),
      InvalidCredentialsError,
    ],
  ])(
    'issues nothing when the user was %s after the password check',
    async (_label, lockedUser, expectedError) => {
      const findByEmail = jest.fn().mockResolvedValue(buildUser());
      const findByIdForUpdate = jest.fn().mockResolvedValue(lockedUser);

      const userRepository = mockOf<UserRepository>({
        findByEmail,
        findByIdForUpdate,
      });

      const verify = jest.fn().mockResolvedValue(true);
      const passwordHasher = mockOf<PasswordHasher>({ verify });
      const issue = jest.fn();
      const issueAuthTokens = mockOf<IssueAuthTokensService>({ issue });

      const useCase = new LoginUseCase(
        userRepository,
        passwordHasher,
        issueAuthTokens,
        buildTransactionManager(),
      );

      await expect(useCase.execute(input)).rejects.toBeInstanceOf(
        expectedError,
      );
      expect(issue).not.toHaveBeenCalled();
    },
  );
});
