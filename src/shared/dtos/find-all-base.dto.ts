import { BaseEntity } from 'src/core/domain/entities/base.entity';
import {
  StatusEnum,
  StatusEnumTranslation,
} from 'src/core/domain/enums/status.enum';

export class FindAllBaseDto {
  uuid: string;
  status: StatusEnum;
  statusLabel: string;
  createdAt: Date;
  updatedAt: Date;

  constructor(entity: BaseEntity) {
    this.uuid = entity.uuid.toString();
    this.status = entity.status;
    this.statusLabel = StatusEnumTranslation[entity.status] ?? entity.status;
    this.createdAt = entity.createdAt;
    this.updatedAt = entity.updatedAt;
  }
}
