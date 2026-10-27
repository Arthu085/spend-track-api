import { Inject, Injectable, Logger } from '@nestjs/common';
import { describeError } from '@shared/application/logging';
import type { AuditLogPort, AuditRecordInput } from '@shared/application/ports';
import { AuditLog } from '../../domain/entities/audit-log.entity';
import { AUDIT_LOG_REPOSITORY } from '../../domain/repositories/audit-log.repository';
import type { AuditLogRepository } from '../../domain/repositories/audit-log.repository';

@Injectable()
export class RecordAuditLogUseCase implements AuditLogPort {
  private readonly logger = new Logger(RecordAuditLogUseCase.name);

  constructor(
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly repository: AuditLogRepository,
  ) {}

  async record(input: AuditRecordInput): Promise<void> {
    try {
      const log = AuditLog.create({
        uuid: input.uuid,
        userId: input.userId,
        action: input.action,
        method: input.method,
        path: input.path,
        outcome: input.outcome,
        statusCode: input.statusCode,
        context: input.context ?? null,
        errorMessage: input.errorMessage ?? null,
        occurredAt: new Date(),
      });

      await this.repository.save(log);
    } catch (error) {
      this.logger.error({
        msg: 'Failed to persist audit log',
        action: input.action,
        error: describeError(error),
      });
    }
  }
}
