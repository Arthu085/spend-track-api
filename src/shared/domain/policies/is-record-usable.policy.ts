import { RecordStatus } from '../enums/record-status.enum';

export function isRecordUsable(
  record: {
    readonly status: RecordStatus;
    readonly deletedAt: Date | null;
  } | null,
): boolean {
  return (
    record !== null &&
    record.status === RecordStatus.ACTIVE &&
    record.deletedAt === null
  );
}
