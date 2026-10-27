import { BaseEntity } from '@shared/domain/entities/base.entity';
import { Subject } from '@shared/domain/authorization/subject';
import { Action } from '@shared/domain/enums/action.enum';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';

export interface ReconstituteAbilityInput {
  id: number;
  uuid: string;
  status: RecordStatus;
  action: Action;
  subject: Subject;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export class AbilityEntity extends BaseEntity {
  private constructor(
    id: number,
    uuid: string,
    status: RecordStatus,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
    readonly action: Action,
    readonly subject: Subject,
  ) {
    super(id, uuid, status, createdAt, updatedAt, deletedAt);
  }

  static reconstitute(input: ReconstituteAbilityInput): AbilityEntity {
    return new AbilityEntity(
      input.id,
      input.uuid,
      input.status,
      input.createdAt,
      input.updatedAt,
      input.deletedAt,
      input.action,
      input.subject,
    );
  }
}
