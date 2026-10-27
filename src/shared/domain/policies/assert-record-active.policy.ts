import { DomainError } from '../errors/domain-error';
import { RecordStatus } from '../enums/record-status.enum';

export function assertRecordActive(
  record: { readonly status: RecordStatus },
  error: DomainError,
): void {
  if (record.status !== RecordStatus.ACTIVE) {
    throw error;
  }
}
