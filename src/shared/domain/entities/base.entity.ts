import { RecordStatus } from '../enums/record-status.enum';
import { BaseTechnicalEntity } from './base-technical.entity';

export abstract class BaseEntity extends BaseTechnicalEntity {
  protected constructor(
    id: number,
    uuid: string,
    readonly status: RecordStatus,
    createdAt: Date,
    readonly updatedAt: Date,
    readonly deletedAt: Date | null,
  ) {
    super(id, uuid, createdAt);
  }
}
