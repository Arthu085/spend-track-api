import type { TransactionManagerPort } from '@shared/application/ports';
import { RoleEntity, RoleEnum } from '@modules/authorization';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { buildUser } from '@test/support/builders/user.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import type { UserEntity } from '../../../domain/entities/user.entity';
import { AdminTargetForbiddenError } from '../../../domain/errors/admin-target-forbidden.error';
import { EmailConfirmationStaleError } from '../../../domain/errors/email-confirmation-stale.error';
import { InactiveUserError } from '../../../domain/errors/inactive-user.error';
import { UserNotFoundError } from '../../../domain/errors/user-not-found.error';
import type { EmailConfirmationTokenRepository } from '../../../domain/repositories/email-confirmation-token.repository';
import type { UserRepository } from '../../../domain/repositories/user.repository';
import { ConfirmUserEmailUseCase } from '../confirm-user-email.use-case';

const input = { uuid: 'user-uuid', email: 'jane@example.com', actorId: 2 };

const adminRole = RoleEntity.reconstitute({
  id: 1,
  uuid: 'admin-role',
  name: RoleEnum.ADMIN,
  status: RecordStatus.ACTIVE,
  abilities: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
});

function setup(
  user: UserEntity | null = buildUser({ emailConfirmedAt: null }),
  actor: UserEntity | null = buildUser({ id: 2 }),
) {
  const events: string[] = [];
  const update = jest.fn((value: UserEntity) => Promise.resolve(value));

  const consumeAllForUser = jest.fn(() => {
    events.push('consume-tokens');
    return Promise.resolve();
  });

  const users = mockOf<UserRepository>({
    lockAdminRoster: jest.fn(() => {
      events.push('lock-roster');
      return Promise.resolve();
    }),
    findByUuidForUpdate: jest.fn(() => {
      events.push('lock-user');
      return Promise.resolve(user);
    }),
    findById: jest.fn(() => Promise.resolve(actor)),
    update,
  });

  const tokens = mockOf<EmailConfirmationTokenRepository>({
    consumeAllForUser,
  });

  const transactions = mockOf<TransactionManagerPort>({
    runInTransaction: <T>(work: () => Promise<T>) => {
      events.push('begin');
      return work();
    },
  });

  return {
    useCase: new ConfirmUserEmailUseCase(users, tokens, transactions),
    update,
    consumeAllForUser,
    events,
  };
}

describe('ConfirmUserEmailUseCase', () => {
  it('confirms the locked user, records the actor, and consumes outstanding tokens', async () => {
    const { useCase, consumeAllForUser, events } = setup();

    const result = await useCase.execute({
      ...input,
      email: ' Jane@Example.com ',
    });

    expect(result.emailConfirmedAt).toBeInstanceOf(Date);
    expect(result.updatedBy).toBe(input.actorId);
    expect(result.email).toBe('jane@example.com');
    expect(consumeAllForUser).toHaveBeenCalledWith(result.id);
    expect(events).toEqual([
      'begin',
      'lock-roster',
      'lock-user',
      'consume-tokens',
    ]);
  });

  it('preserves the timestamp and authorship on repeated confirmation', async () => {
    const user = buildUser({ updatedBy: 5 });
    const { useCase, update, consumeAllForUser } = setup(user);

    expect(await useCase.execute(input)).toBe(user);
    expect(update).not.toHaveBeenCalled();
    expect(consumeAllForUser).toHaveBeenCalledWith(user.id);
  });

  it('rejects a missing or deleted target', async () => {
    const { useCase, consumeAllForUser } = setup(null);

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
    expect(consumeAllForUser).not.toHaveBeenCalled();
  });

  it('rejects an inactive target before consuming tokens', async () => {
    const { useCase, consumeAllForUser } = setup(
      buildUser({ status: RecordStatus.INACTIVE }),
    );

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(
      InactiveUserError,
    );
    expect(consumeAllForUser).not.toHaveBeenCalled();
  });

  it('rejects approval for a different email without writing', async () => {
    const { useCase, update, consumeAllForUser } = setup(
      buildUser({ email: 'changed@example.com', emailConfirmedAt: null }),
    );

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(
      EmailConfirmationStaleError,
    );
    expect(update).not.toHaveBeenCalled();
    expect(consumeAllForUser).not.toHaveBeenCalled();
  });

  it.each([
    null,
    buildUser({ id: 2 }),
    buildUser({ id: 2, status: RecordStatus.INACTIVE, roles: [adminRole] }),
    buildUser({ id: 2, deletedAt: new Date(), roles: [adminRole] }),
  ])('rejects a non-active-admin actor acting on an admin', async (actor) => {
    const { useCase, update } = setup(
      buildUser({ roles: [adminRole], emailConfirmedAt: null }),
      actor,
    );

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(
      AdminTargetForbiddenError,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('allows an active admin to confirm another admin', async () => {
    const { useCase } = setup(
      buildUser({ roles: [adminRole], emailConfirmedAt: null }),
      buildUser({ id: 2, roles: [adminRole] }),
    );

    expect((await useCase.execute(input)).emailConfirmedAt).toBeInstanceOf(
      Date,
    );
  });

  it('propagates token-consumption failure without writing the user', async () => {
    const { useCase, consumeAllForUser, update } = setup();
    consumeAllForUser.mockRejectedValueOnce(
      new Error('token store unavailable'),
    );

    await expect(useCase.execute(input)).rejects.toThrow(
      'token store unavailable',
    );
    expect(update).not.toHaveBeenCalled();
  });
});
