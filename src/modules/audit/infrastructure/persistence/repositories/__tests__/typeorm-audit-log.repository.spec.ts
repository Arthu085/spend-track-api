import type { Repository } from 'typeorm';
import { AuditOutcome } from '@shared/domain/enums/audit-outcome.enum';
import { AuditLog } from '../../../../domain/entities/audit-log.entity';
import { AuditLogOrmEntity } from '../../entities/audit-log.orm-entity';
import { AuditLogMapper } from '../../mappers/audit-log.mapper';
import { TypeOrmAuditLogRepository } from '../typeorm-audit-log.repository';

describe('TypeOrmAuditLogRepository', () => {
  it('maps the domain entity and calls Repository#insert with the mapped row', async () => {
    const insert = jest.fn().mockResolvedValue(undefined);
    const repository = { insert } as unknown as Repository<AuditLogOrmEntity>;
    const adapter = new TypeOrmAuditLogRepository(repository);

    const log = AuditLog.create({
      uuid: 'log-uuid',
      userId: null,
      action: 'User.update',
      method: 'PATCH',
      path: '/api/users/1',
      outcome: AuditOutcome.SUCCESS,
      statusCode: 200,
      context: { ip: '127.0.0.1' },
      errorMessage: null,
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    await adapter.save(log);

    expect(insert).toHaveBeenCalledTimes(1);

    const [insertedRow] = insert.mock.calls[0] as [AuditLogOrmEntity];

    expect(insertedRow).toEqual(AuditLogMapper.toOrm(log));
  });

  it('propagates a repository failure to the caller', async () => {
    const insert = jest.fn().mockRejectedValue(new Error('connection lost'));
    const repository = { insert } as unknown as Repository<AuditLogOrmEntity>;
    const adapter = new TypeOrmAuditLogRepository(repository);

    const log = AuditLog.create({
      uuid: 'log-uuid-2',
      userId: 'user-1',
      action: 'User.delete',
      method: 'DELETE',
      path: '/api/users/1',
      outcome: AuditOutcome.FAILURE,
      statusCode: 500,
      context: null,
      errorMessage: 'boom',
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    await expect(adapter.save(log)).rejects.toThrow('connection lost');
  });
});
