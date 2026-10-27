import { Inject, Injectable } from '@nestjs/common';
import {
  deleteInBatches,
  retentionCutoff,
} from '@shared/application/retention';
import {
  AUDIT_LOG_REPOSITORY,
  type AuditLogRepository,
} from '../../domain/repositories/audit-log.repository';

export interface CleanupAuditLogsInput {
  retentionDays: number;
  batchSize: number;
}

@Injectable()
export class CleanupAuditLogsUseCase {
  constructor(
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogRepository: AuditLogRepository,
  ) {}

  async execute(input: CleanupAuditLogsInput): Promise<number> {
    const cutoff = retentionCutoff(new Date(), input.retentionDays);

    return deleteInBatches(
      (limit) => this.auditLogRepository.deleteCreatedBefore(cutoff, limit),
      input.batchSize,
    );
  }
}
