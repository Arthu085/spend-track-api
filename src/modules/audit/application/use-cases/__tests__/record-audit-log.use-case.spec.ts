import { Logger } from '@nestjs/common';
import type { AuditRecordInput } from '@shared/application/ports';
import { AuditOutcome } from '@shared/domain/enums/audit-outcome.enum';
import type { AuditLog } from '../../../domain/entities/audit-log.entity';
import type { AuditLogRepository } from '../../../domain/repositories/audit-log.repository';
import { RecordAuditLogUseCase } from '../record-audit-log.use-case';

describe('RecordAuditLogUseCase', () => {
  const fixedUuid = 'fixed-test-uuid-0000-0000-000000000000';

  const baseInput: AuditRecordInput = {
    uuid: fixedUuid,
    userId: 'user-1',
    action: 'User.update',
    method: 'PATCH',
    path: '/api/users/1',
    outcome: AuditOutcome.SUCCESS,
    statusCode: 200,
    context: { ip: '127.0.0.1' },
    errorMessage: null,
  };

  it('maps the port input to a domain AuditLog and calls the repository', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const repository = { save } as unknown as AuditLogRepository;
    const useCase = new RecordAuditLogUseCase(repository);

    await useCase.record(baseInput);

    expect(save).toHaveBeenCalledTimes(1);

    const [log] = save.mock.calls[0] as [AuditLog];

    expect(log.userId).toBe('user-1');
    expect(log.action).toBe('User.update');
    expect(log.method).toBe('PATCH');
    expect(log.path).toBe('/api/users/1');
    expect(log.outcome).toBe(AuditOutcome.SUCCESS);
    expect(log.statusCode).toBe(200);
    expect(log.context).toEqual({ ip: '127.0.0.1' });
    expect(log.errorMessage).toBeNull();
    expect(log.uuid).toBe(fixedUuid);
    expect(log.occurredAt).toBeInstanceOf(Date);
  });

  it('defaults an undefined context/errorMessage to null', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const repository = { save } as unknown as AuditLogRepository;
    const useCase = new RecordAuditLogUseCase(repository);

    await useCase.record({
      ...baseInput,
      context: undefined,
      errorMessage: undefined,
    });

    const [log] = save.mock.calls[0] as [AuditLog];

    expect(log.context).toBeNull();
    expect(log.errorMessage).toBeNull();
  });

  it('swallows a repository rejection, logs it, and still resolves', async () => {
    const save = jest.fn().mockRejectedValue(new Error('db down'));
    const repository = { save } as unknown as AuditLogRepository;
    const useCase = new RecordAuditLogUseCase(repository);

    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();

    await expect(useCase.record(baseInput)).resolves.toBeUndefined();
    expect(loggerSpy).toHaveBeenCalledWith({
      msg: 'Failed to persist audit log',
      action: baseInput.action,
      error: 'db down',
    });

    loggerSpy.mockRestore();
  });
});
