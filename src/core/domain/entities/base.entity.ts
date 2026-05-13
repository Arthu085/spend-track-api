import { StatusEnum } from '../enums/status.enum';
import { Uuid } from '../value-objects/uuid.vo';
import { AppBadRequestException } from 'src/core/exceptions/app-bad-request.exception';

type Gender = 'M' | 'F';

export abstract class BaseEntity {
  protected _id: number;
  protected _uuid: Uuid;
  protected _createdAt: Date;
  protected _updatedAt: Date;
  protected _deletedAt?: Date | null;
  protected _status: StatusEnum;

  constructor(props: {
    id: number;
    uuid: Uuid;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date | null;
    status: StatusEnum;
  }) {
    this._id = props.id;
    this._uuid = props.uuid;
    this._createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
    this._deletedAt = props.deletedAt ?? null;
    this._status = props.status;
  }

  get id(): number {
    return this._id;
  }

  get uuid(): Uuid {
    return this._uuid;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  get deletedAt(): Date | null | undefined {
    return this._deletedAt;
  }

  get status(): StatusEnum {
    return this._status;
  }

  ensureIsNotInactive(resource: string, gender: Gender): void {
    if (this._status === StatusEnum.INACTIVE) {
      throw new AppBadRequestException({
        message: `${resource} está ${gender === 'M' ? 'inativo' : 'inativa'}`,
      });
    }
  }

  activate(resource: string, gender: Gender): void {
    if (this._deletedAt) {
      throw new AppBadRequestException({
        message: `Não é possível ativar um dado excluído`,
      });
    }

    if (this._status === StatusEnum.ACTIVE) {
      throw new AppBadRequestException({
        message: `${resource} já está ${gender === 'M' ? 'ativo' : 'ativa'}`,
      });
    }

    this._status = StatusEnum.ACTIVE;
    this.touch();
  }

  deactivate(resource: string, gender: Gender): void {
    if (this._deletedAt) {
      throw new AppBadRequestException({
        message: `Não é possível desativar um dado excluído`,
      });
    }

    if (this._status === StatusEnum.INACTIVE) {
      throw new AppBadRequestException({
        message: `${resource} já está ${gender === 'M' ? 'inativo' : 'inativa'}`,
      });
    }

    this._status = StatusEnum.INACTIVE;
    this.touch();
  }

  delete(): void {
    if (this._deletedAt) return;

    this.deactivate('entidade', 'M');
    this._deletedAt = new Date();
    this.touch();
  }

  protected touch(): void {
    this._updatedAt = new Date();
  }
}
