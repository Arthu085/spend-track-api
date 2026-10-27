import { AuditOutcome } from '@shared/domain/enums/audit-outcome.enum';
import { AuditLog } from '../../../../domain/entities/audit-log.entity';
import { AuditLogOrmEntity } from '../../entities/audit-log.orm-entity';
import { AuditLogMapper } from '../audit-log.mapper';

describe('AuditLogMapper', () => {
  const occurredAt = new Date('2026-01-01T00:00:00.000Z');

  it('maps a domain AuditLog with a populated context to an ORM entity', () => {
    const domain = AuditLog.create({
      uuid: 'log-uuid',
      userId: 'user-1',
      action: 'User.update',
      method: 'PATCH',
      path: '/api/users/1',
      outcome: AuditOutcome.SUCCESS,
      statusCode: 200,
      context: { ip: '127.0.0.1', userAgent: 'jest' },
      errorMessage: null,
      occurredAt,
    });

    const orm = AuditLogMapper.toOrm(domain);

    expect(orm).toBeInstanceOf(AuditLogOrmEntity);
    expect(orm.uuid).toBe('log-uuid');
    expect(orm.userId).toBe('user-1');
    expect(orm.action).toBe('User.update');
    expect(orm.method).toBe('PATCH');
    expect(orm.path).toBe('/api/users/1');
    expect(orm.outcome).toBe(AuditOutcome.SUCCESS);
    expect(orm.statusCode).toBe(200);
    expect(orm.context).toEqual({ ip: '127.0.0.1', userAgent: 'jest' });
    expect(orm.errorMessage).toBeNull();
  });

  it('round-trips a null user/context/error through toOrm and back via toDomain', () => {
    const domain = AuditLog.create({
      uuid: 'log-uuid-2',
      userId: null,
      action: 'Health.check',
      method: 'GET',
      path: '/api/health',
      outcome: AuditOutcome.FAILURE,
      statusCode: 403,
      context: null,
      errorMessage: null,
      occurredAt,
    });

    const orm = AuditLogMapper.toOrm(domain);
    orm.createdAt = occurredAt;

    expect(orm.userId).toBeNull();
    expect(orm.context).toBeNull();
    expect(orm.errorMessage).toBeNull();

    const roundTripped = AuditLogMapper.toDomain(orm);

    expect(roundTripped.uuid).toBe(domain.uuid);
    expect(roundTripped.userId).toBeNull();
    expect(roundTripped.action).toBe(domain.action);
    expect(roundTripped.method).toBe(domain.method);
    expect(roundTripped.path).toBe(domain.path);
    expect(roundTripped.outcome).toBe(domain.outcome);
    expect(roundTripped.statusCode).toBe(domain.statusCode);
    expect(roundTripped.context).toBeNull();
    expect(roundTripped.errorMessage).toBeNull();
    expect(roundTripped.occurredAt).toBe(occurredAt);
  });

  it('maps an ORM row with an error message and non-null context back to domain', () => {
    const orm = new AuditLogOrmEntity();
    orm.uuid = 'log-uuid-3';
    orm.userId = 'user-2';
    orm.action = 'User.delete';
    orm.method = 'DELETE';
    orm.path = '/api/users/2';
    orm.outcome = AuditOutcome.FAILURE;
    orm.statusCode = 500;
    orm.context = { ip: '10.0.0.1' };
    orm.errorMessage = 'boom';
    orm.createdAt = occurredAt;

    const domain = AuditLogMapper.toDomain(orm);

    expect(domain.uuid).toBe('log-uuid-3');
    expect(domain.userId).toBe('user-2');
    expect(domain.context).toEqual({ ip: '10.0.0.1' });
    expect(domain.errorMessage).toBe('boom');
    expect(domain.occurredAt).toBe(occurredAt);
  });
});
