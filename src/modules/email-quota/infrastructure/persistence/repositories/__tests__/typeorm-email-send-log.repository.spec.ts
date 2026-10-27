import { Between } from 'typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { EmailType } from '@shared/domain/enums/email-type.enum';
import { EmailSendLogOrmEntity } from '../../entities/email-send-log.orm-entity';
import { TypeOrmEmailSendLogRepository } from '../typeorm-email-send-log.repository';

interface ManagerMock {
  query: jest.Mock;
  countBy: jest.Mock;
  insert: jest.Mock;
}

function buildManager(usedCount: number): ManagerMock {
  return {
    query: jest
      .fn()
      .mockImplementation((sql: string) =>
        Promise.resolve(
          sql === 'SHOW lock_timeout' ? [{ lock_timeout: '5s' }] : [],
        ),
      ),
    countBy: jest.fn().mockResolvedValue(usedCount),
    insert: jest.fn().mockResolvedValue(undefined),
  };
}

// No ambient transaction is active in these specs, so the base class falls
// back to the injected repository and its default manager.
function buildOrmRepository(manager: ManagerMock): {
  ormRepository: Repository<EmailSendLogOrmEntity>;
  transaction: jest.Mock;
} {
  const transaction = jest.fn(
    async (callback: (manager: EntityManager) => Promise<unknown>) =>
      callback(manager as unknown as EntityManager),
  );

  const ormRepository = {
    manager: { transaction },
  } as unknown as Repository<EmailSendLogOrmEntity>;

  return { ormRepository, transaction };
}

describe('TypeOrmEmailSendLogRepository', () => {
  const input = {
    emailType: EmailType.PASSWORD_RESET,
    recipient: 'jane@example.com',
    day: '2026-08-03',
    limit: 5,
  };

  const dayStart = new Date(`${input.day}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  it('wraps the whole operation in a single manager.transaction call (a savepoint when nested)', async () => {
    const manager = buildManager(0);
    const { ormRepository, transaction } = buildOrmRepository(manager);

    const repository = new TypeOrmEmailSendLogRepository(ormRepository);
    await repository.consumeDailySlot(input);

    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('shortens lock_timeout, acquires the advisory lock with the exact key format, then restores the previous lock_timeout', async () => {
    const manager = buildManager(0);
    const { ormRepository } = buildOrmRepository(manager);

    const repository = new TypeOrmEmailSendLogRepository(ormRepository);
    await repository.consumeDailySlot(input);

    expect(manager.query.mock.calls).toEqual([
      ['SHOW lock_timeout'],
      [`SELECT set_config('lock_timeout', $1, true)`, ['3000ms']],
      [
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`email-quota:${input.emailType}:${input.recipient}:${input.day}`],
      ],
      [`SELECT set_config('lock_timeout', $1, true)`, ['5s']],
    ]);
  });

  it('counts existing rows with the exact (emailType, recipient, createdAt between dayStart/dayEnd) fields', async () => {
    const manager = buildManager(0);
    const { ormRepository } = buildOrmRepository(manager);

    const repository = new TypeOrmEmailSendLogRepository(ormRepository);
    await repository.consumeDailySlot(input);

    expect(manager.countBy).toHaveBeenCalledWith(EmailSendLogOrmEntity, {
      emailType: input.emailType,
      recipient: input.recipient,
      createdAt: Between(dayStart, dayEnd),
    });
  });

  it('when the used count is below the limit, inserts a row (relying on the DB default for createdAt) and resolves used + 1', async () => {
    const manager = buildManager(2);
    const { ormRepository } = buildOrmRepository(manager);

    const repository = new TypeOrmEmailSendLogRepository(ormRepository);
    const result = await repository.consumeDailySlot(input);

    expect(manager.insert).toHaveBeenCalledTimes(1);
    expect(manager.insert).toHaveBeenCalledWith(EmailSendLogOrmEntity, {
      emailType: input.emailType,
      recipient: input.recipient,
    });
    expect(result).toBe(3);
  });

  it('when the used count already reached the limit, never inserts and resolves null', async () => {
    const manager = buildManager(5);
    const { ormRepository } = buildOrmRepository(manager);

    const repository = new TypeOrmEmailSendLogRepository(ormRepository);
    const result = await repository.consumeDailySlot(input);

    expect(manager.insert).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('when the used count is above the limit, never inserts and resolves null', async () => {
    const manager = buildManager(9);
    const { ormRepository } = buildOrmRepository(manager);

    const repository = new TypeOrmEmailSendLogRepository(ormRepository);
    const result = await repository.consumeDailySlot(input);

    expect(manager.insert).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});
