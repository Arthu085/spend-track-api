import { RecordStatus } from '../enums/record-status.enum';
import { BaseEntity } from './base.entity';

export abstract class BaseAuditedEntity extends BaseEntity {
  protected constructor(
    id: number,
    uuid: string,
    status: RecordStatus,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
    readonly createdBy: number | null,
    readonly updatedBy: number | null,
    readonly deletedBy: number | null,
  ) {
    super(id, uuid, status, createdAt, updatedAt, deletedAt);
  }
}
