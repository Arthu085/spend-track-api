import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { UnauthorizedError } from '@shared/domain/errors';
import { RoleEnum } from '@modules/authorization/domain/enums/role.enum';
import type {
  AuthSubject,
  UserRepository,
} from '@modules/users/domain/repositories/user.repository';
import { EmailNotConfirmedError } from '../../../domain/errors/email-not-confirmed.error';
import type { RefreshTokenRepository } from '../../../domain/repositories/refresh-token.repository';
import { ValidateAccessTokenUserUseCase } from '../validate-access-token-user.use-case';

function buildSubject(
  status: RecordStatus,
  emailConfirmedAt: Date | null = new Date(),
): AuthSubject {
  return {
    id: 1,
    uuid: 'user-uuid',
    status,
    name: 'Jane Doe',
    email: 'jane@example.com',
    emailConfirmedAt,
    roleNames: [RoleEnum.USER],
  };
}

const input = { userUuid: 'user-uuid', sessionId: 'session-1' };

function buildUseCase(
  subject: AuthSubject | null,
  sessionActive = true,
): {
  useCase: ValidateAccessTokenUserUseCase;
  findAuthSubject: jest.Mock;
  findByUuid: jest.Mock;
  hasActiveSession: jest.Mock;
} {
  const findAuthSubject = jest.fn().mockResolvedValue(subject);
  const findByUuid = jest.fn();
  const hasActiveSession = jest.fn().mockResolvedValue(sessionActive);

  const userRepository = {
    findAuthSubject,
    findByUuid,
  } as unknown as UserRepository;

  const refreshTokenRepository = {
    hasActiveSession,
  } as unknown as RefreshTokenRepository;

  return {
    useCase: new ValidateAccessTokenUserUseCase(
      userRepository,
      refreshTokenRepository,
    ),
    findAuthSubject,
    findByUuid,
    hasActiveSession,
  };
}

describe('ValidateAccessTokenUserUseCase', () => {
  it('returns the auth subject when found, ACTIVE and email-confirmed', async () => {
    const subject = buildSubject(RecordStatus.ACTIVE);
    const { useCase, findAuthSubject } = buildUseCase(subject);

    await expect(useCase.execute(input)).resolves.toBe(subject);
    expect(findAuthSubject).toHaveBeenCalledWith('user-uuid');
  });

  it('uses the lean auth-subject lookup instead of the fully hydrated findByUuid', async () => {
    const { useCase, findByUuid } = buildUseCase(
      buildSubject(RecordStatus.ACTIVE),
    );

    await useCase.execute(input);

    expect(findByUuid).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedError when no user matches the uuid', async () => {
    const { useCase } = buildUseCase(null);

    await expect(
      useCase.execute({ ...input, userUuid: 'missing-uuid' }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('throws UnauthorizedError when the user is INACTIVE', async () => {
    const { useCase } = buildUseCase(buildSubject(RecordStatus.INACTIVE));

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('checks that the token session is still live for the subject', async () => {
    const { useCase, hasActiveSession } = buildUseCase(
      buildSubject(RecordStatus.ACTIVE),
    );

    await useCase.execute(input);

    expect(hasActiveSession).toHaveBeenCalledWith(
      1,
      'session-1',
      expect.any(Date),
    );
  });

  it('throws UnauthorizedError when the token session was revoked', async () => {
    const { useCase } = buildUseCase(buildSubject(RecordStatus.ACTIVE), false);

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('throws UnauthorizedError (never EmailNotConfirmedError) for a revoked session of an unconfirmed user', async () => {
    const { useCase } = buildUseCase(
      buildSubject(RecordStatus.ACTIVE, null),
      false,
    );

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('skips the session lookup when the user is gone or INACTIVE', async () => {
    const { useCase, hasActiveSession } = buildUseCase(
      buildSubject(RecordStatus.INACTIVE),
    );

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(hasActiveSession).not.toHaveBeenCalled();
  });

  it('throws EmailNotConfirmedError when the user is ACTIVE but has never confirmed their email', async () => {
    const { useCase } = buildUseCase(buildSubject(RecordStatus.ACTIVE, null));

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(
      EmailNotConfirmedError,
    );
  });
});
