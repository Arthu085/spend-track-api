import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import { AuditOutcome } from '@shared/domain/enums/audit-outcome.enum';
import { AuditLog } from '../../../../domain/entities/audit-log.entity';
import { AuditLogOrmEntity } from '../../entities/audit-log.orm-entity';
import { TypeOrmAuditLogRepository } from '../typeorm-audit-log.repository';

interface AuditLogRow {
  user_id: string | null;
  action: string;
  method: string;
  path: string;
  outcome: string;
  status_code: number;
  context: Record<string, unknown> | null;
  error_message: string | null;
}

describe('TypeOrmAuditLogRepository (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let repository: TypeOrmAuditLogRepository;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        CoreConfigModule,
        DatabaseModule,
        TypeOrmModule.forFeature([AuditLogOrmEntity]),
      ],
      providers: [TypeOrmAuditLogRepository],
    }).compile();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
    repository = moduleRef.get(TypeOrmAuditLogRepository);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  afterEach(async () => {
    await dataSource.query('DELETE FROM "audit_logs"');
  });

  it('created the audit_logs table (via migration) with the expected columns', async () => {
    const columns: Array<{ column_name: string; data_type: string }> =
      await dataSource.query(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'audit_logs'`,
      );

    const columnNames = columns.map((column) => column.column_name).sort();

    expect(columnNames).toEqual(
      [
        'id',
        'uuid',
        'created_at',
        'user_id',
        'action',
        'method',
        'path',
        'outcome',
        'status_code',
        'context',
        'error_message',
      ].sort(),
    );

    const contextColumn = columns.find(
      (column) => column.column_name === 'context',
    );

    expect(contextColumn?.data_type).toBe('jsonb');
  });

  it('saves a SUCCESS record with a null user_id and a jsonb context, and reads it back', async () => {
    const log = AuditLog.create({
      uuid: randomUUID(),
      userId: null,
      action: 'Health.check',
      method: 'GET',
      path: '/api/health',
      outcome: AuditOutcome.SUCCESS,
      statusCode: 200,
      context: { ip: '127.0.0.1', userAgent: 'jest' },
      errorMessage: null,
      occurredAt: new Date(),
    });

    await repository.save(log);

    const rows: AuditLogRow[] = await dataSource.query(
      `SELECT user_id, action, method, path, outcome, status_code, context, error_message FROM "audit_logs" WHERE uuid = $1`,
      [log.uuid],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBeNull();
    expect(rows[0].action).toBe('Health.check');
    expect(rows[0].method).toBe('GET');
    expect(rows[0].path).toBe('/api/health');
    expect(rows[0].outcome).toBe(AuditOutcome.SUCCESS);
    expect(rows[0].status_code).toBe(200);
    expect(rows[0].context).toEqual({ ip: '127.0.0.1', userAgent: 'jest' });
    expect(rows[0].error_message).toBeNull();
  });

  it('saves a FAILURE record with status_code 403', async () => {
    const log = AuditLog.create({
      uuid: randomUUID(),
      userId: 'user-1',
      action: 'Thing.delete',
      method: 'DELETE',
      path: '/api/things/1',
      outcome: AuditOutcome.FAILURE,
      statusCode: 403,
      context: null,
      errorMessage: 'Forbidden',
      occurredAt: new Date(),
    });

    await repository.save(log);

    const rows: AuditLogRow[] = await dataSource.query(
      `SELECT user_id, outcome, status_code, error_message FROM "audit_logs" WHERE uuid = $1`,
      [log.uuid],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe('user-1');
    expect(rows[0].outcome).toBe(AuditOutcome.FAILURE);
    expect(rows[0].status_code).toBe(403);
    expect(rows[0].error_message).toBe('Forbidden');
  });

  describe('deleteCreatedBefore', () => {
    const cutoff = new Date('2026-01-10T00:00:00.000Z');

    async function insertCreatedAt(createdAt: Date): Promise<number> {
      const rows: Array<{ id: number }> = await dataSource.query(
        `INSERT INTO "audit_logs" (action, method, path, outcome, status_code, created_at)
         VALUES ('User.update', 'PATCH', '/api/users', 'SUCCESS', 200, $1)
         RETURNING id`,
        [createdAt],
      );

      return rows[0].id;
    }

    async function remainingIds(): Promise<number[]> {
      const rows: Array<{ id: number }> = await dataSource.query(
        'SELECT id FROM "audit_logs" ORDER BY id',
      );

      return rows.map((row) => row.id);
    }

    it('deletes only rows created strictly before the cutoff', async () => {
      await insertCreatedAt(new Date(cutoff.getTime() - 1));

      const atCutoff = await insertCreatedAt(cutoff);
      const afterCutoff = await insertCreatedAt(new Date(cutoff.getTime() + 1));

      await expect(repository.deleteCreatedBefore(cutoff, 100)).resolves.toBe(
        1,
      );
      await expect(remainingIds()).resolves.toEqual([atCutoff, afterCutoff]);
    });

    it('deletes at most limit rows per call, oldest first, and is safe to repeat', async () => {
      const createdAt = new Date(cutoff.getTime() - 60_000);

      await insertCreatedAt(createdAt);
      await insertCreatedAt(createdAt);

      const newest = await insertCreatedAt(createdAt);

      await expect(repository.deleteCreatedBefore(cutoff, 2)).resolves.toBe(2);
      await expect(remainingIds()).resolves.toEqual([newest]);
      await expect(repository.deleteCreatedBefore(cutoff, 2)).resolves.toBe(1);
      await expect(repository.deleteCreatedBefore(cutoff, 2)).resolves.toBe(0);
    });

    it('skips rows locked by a concurrent run instead of waiting for them', async () => {
      const createdAt = new Date(cutoff.getTime() - 60_000);
      const lockedId = await insertCreatedAt(createdAt);
      const freeId = await insertCreatedAt(createdAt);
      const concurrentRun = dataSource.createQueryRunner();

      await concurrentRun.connect();
      await concurrentRun.startTransaction();

      try {
        await concurrentRun.query(
          'SELECT id FROM "audit_logs" WHERE id = $1 FOR UPDATE',
          [lockedId],
        );

        await expect(repository.deleteCreatedBefore(cutoff, 100)).resolves.toBe(
          1,
        );
        await expect(remainingIds()).resolves.not.toContain(freeId);
        await expect(remainingIds()).resolves.toContain(lockedId);
      } finally {
        await concurrentRun.rollbackTransaction();
        await concurrentRun.release();
      }
    });
  });
});
