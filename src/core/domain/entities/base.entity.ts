import { StatusEnum } from '../enums/status.enum';

export abstract class BaseEntity {
  protected _id: number;
  protected _uuid: string;
  protected _createdAt: Date;
  protected _updatedAt: Date | null;
  protected _deletedAt: Date | null;
  protected _status: StatusEnum;

  constructor(
    id: number,
    uuid: string,
    createdAt: Date,
    updatedAt: Date | null,
    deletedAt: Date | null,
    status: StatusEnum,
  ) {
    this._id = id;
    this._uuid = uuid;
    this._createdAt = createdAt;
    this._updatedAt = updatedAt;
    this._deletedAt = deletedAt;
    this._status = status;
  }

  get uuid(): string {
    return this._uuid;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date | null {
    return this._updatedAt;
  }

  get status(): StatusEnum {
    return this._status;
  }

  isActive(): boolean {
    return this._status === StatusEnum.ACTIVE;
  }
}
