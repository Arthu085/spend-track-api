import { StatusEnum } from '../enums/status.enum';
import { Uuid } from '../value-objects/uuid.vo';

export abstract class BaseEntity {
  protected _id?: number;
  protected _uuid: Uuid;
  protected _createdAt: Date;
  protected _updatedAt: Date | null;
  protected _deletedAt: Date | null;
  protected _status: StatusEnum;

  constructor(props?: {
    id?: number;
    uuid?: Uuid;
    createdAt?: Date;
    updatedAt?: Date | null;
    deletedAt?: Date | null;
    status?: StatusEnum;
  }) {
    this._id = props?.id;
    this._uuid = props?.uuid ?? Uuid.create();
    this._createdAt = props?.createdAt ?? new Date();
    this._updatedAt = props?.updatedAt ?? null;
    this._deletedAt = props?.deletedAt ?? null;
    this._status = props?.status ?? StatusEnum.ACTIVE;
  }

  get id(): number | undefined {
    return this._id;
  }

  get uuid(): Uuid {
    return this._uuid;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date | null {
    return this._updatedAt;
  }

  get deletedAt(): Date | null {
    return this._deletedAt;
  }

  get status(): StatusEnum {
    return this._status;
  }

  isActive(): boolean {
    return this._status === StatusEnum.ACTIVE && !this._deletedAt;
  }

  activate(): void {
    if (this._deletedAt) {
      throw new Error('Não é possível ativar uma entidade excluída');
    }

    this._status = StatusEnum.ACTIVE;
    this.touch();
  }

  deactivate(): void {
    if (this._deletedAt) {
      throw new Error('Não é possível desativar uma entidade excluída');
    }

    this._status = StatusEnum.INACTIVE;
    this.touch();
  }

  delete(): void {
    if (this._deletedAt) return;

    this._deletedAt = new Date();
    this.touch();
  }

  protected touch(): void {
    this._updatedAt = new Date();
  }
}
