import type { FindOperator, Repository } from 'typeorm';
import { PasswordResetTokenEntity } from '../../../../domain/entities/password-reset-token.entity';
import { PasswordResetTokenOrmEntity } from '../../entities/password-reset-token.orm-entity';
import { TypeOrmPasswordResetTokenRepository } from '../typeorm-password-reset-token.repository';

function buildOrm(): PasswordResetTokenOrmEntity {
  const orm = new PasswordResetTokenOrmEntity();
  orm.id = 1;
  orm.uuid = 'token-uuid';
  orm.userId = 1;
  orm.tokenHash = 'hashed-secret';
  orm.expiresAt = new Date(Date.now() + 60_000);
  orm.consumedAt = null;
  orm.createdAt = new Date();
  return orm;
}

function buildDomain(): PasswordResetTokenEntity {
  return PasswordResetTokenEntity.issue({
    uuid: 'token-uuid',
    userId: 1,
    tokenHash: 'hashed-secret',
    expiresAt: new Date(Date.now() + 60_000),
  });
}

describe('TypeOrmPasswordResetTokenRepository', () => {
  it('create saves the mapped entity and returns the mapped domain result', async () => {
    const save = jest.fn().mockResolvedValue(buildOrm());

    const repository = {
      save,
    } as unknown as Repository<PasswordResetTokenOrmEntity>;

    const adapter = new TypeOrmPasswordResetTokenRepository(repository);

    const result = await adapter.create(buildDomain());

    expect(save).toHaveBeenCalledTimes(1);
    expect(result).toBeInstanceOf(PasswordResetTokenEntity);
    expect(result.uuid).toBe('token-uuid');
  });

  it('findByUuid returns null when no row matches', async () => {
    const findOne = jest.fn().mockResolvedValue(null);

    const repository = {
      findOne,
    } as unknown as Repository<PasswordResetTokenOrmEntity>;

    const adapter = new TypeOrmPasswordResetTokenRepository(repository);

    await expect(adapter.findByUuid('missing')).resolves.toBeNull();
    expect(findOne).toHaveBeenCalledWith({ where: { uuid: 'missing' } });
  });

  it('findByUuid maps the row to a domain entity when found', async () => {
    const findOne = jest.fn().mockResolvedValue(buildOrm());

    const repository = {
      findOne,
    } as unknown as Repository<PasswordResetTokenOrmEntity>;

    const adapter = new TypeOrmPasswordResetTokenRepository(repository);

    const result = await adapter.findByUuid('token-uuid');

    expect(result).toBeInstanceOf(PasswordResetTokenEntity);
    expect(result?.uuid).toBe('token-uuid');
  });

  it('consumeIfUnconsumed consumes only a not-yet-consumed row and reports whether it won', async () => {
    const update = jest.fn().mockResolvedValue({ affected: 1 });

    const repository = {
      update,
    } as unknown as Repository<PasswordResetTokenOrmEntity>;

    const adapter = new TypeOrmPasswordResetTokenRepository(repository);

    await expect(adapter.consumeIfUnconsumed('token-uuid')).resolves.toBe(true);

    const [criteria, patch] = update.mock.calls[0] as [
      { uuid: string; consumedAt: FindOperator<unknown> },
      Record<string, unknown>,
    ];

    expect(criteria.uuid).toBe('token-uuid');
    expect(criteria.consumedAt.type).toBe('isNull');
    expect(patch.consumedAt).toBeInstanceOf(Date);
  });

  it('consumeIfUnconsumed returns false when no row was updated', async () => {
    const update = jest.fn().mockResolvedValue({ affected: 0 });

    const repository = {
      update,
    } as unknown as Repository<PasswordResetTokenOrmEntity>;

    const adapter = new TypeOrmPasswordResetTokenRepository(repository);

    await expect(adapter.consumeIfUnconsumed('token-uuid')).resolves.toBe(
      false,
    );
  });

  it('consumeAllForUser updates every unconsumed row for the user', async () => {
    const update = jest.fn().mockResolvedValue(undefined);

    const repository = {
      update,
    } as unknown as Repository<PasswordResetTokenOrmEntity>;

    const adapter = new TypeOrmPasswordResetTokenRepository(repository);

    await adapter.consumeAllForUser(7);

    expect(update).toHaveBeenCalledTimes(1);

    const [criteria, patch] = update.mock.calls[0] as [
      { userId: number; consumedAt: FindOperator<unknown> },
      Record<string, unknown>,
    ];

    expect(criteria.userId).toBe(7);
    expect(criteria.consumedAt.type).toBe('isNull');
    expect(patch.consumedAt).toBeInstanceOf(Date);
  });
});
