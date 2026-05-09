import { BaseEntity } from 'src/core/domain/entities/base.entity';
import { ActionEnum } from '../../../../core/domain/enums/action.enum';
import { SubjectEnum } from '../../../../core/domain/enums/subject.enum';
import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import { StatusEnum } from 'src/core/domain/enums/status.enum';
import { AppBadRequestException } from 'src/core/exceptions/app-bad-request.exception';

export class AbilityEntity extends BaseEntity {
  private _action: ActionEnum;
  private _subject: SubjectEnum;

  private constructor(props: {
    id: number;
    uuid: Uuid;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date | null;
    status: StatusEnum;
    action: ActionEnum;
    subject: SubjectEnum;
  }) {
    super(props);

    if (!props.action) {
      throw new AppBadRequestException({
        message: 'Ação é obrigatória',
      });
    }

    if (!props.subject) {
      throw new AppBadRequestException({
        message: 'Sujeito é obrigatório',
      });
    }

    this._action = props.action;
    this._subject = props.subject;
  }

  get action(): ActionEnum {
    return this._action;
  }

  get subject(): SubjectEnum {
    return this._subject;
  }

  static create(props: {
    action: ActionEnum;
    subject: SubjectEnum;
  }): AbilityEntity {
    return new AbilityEntity({
      ...props,
      id: 0,
      uuid: Uuid.create(),
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      status: StatusEnum.ACTIVE,
    });
  }

  static rehydrate(props: {
    id: number;
    uuid: Uuid;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date | null;
    status: StatusEnum;
    action: ActionEnum;
    subject: SubjectEnum;
  }): AbilityEntity {
    return new AbilityEntity(props);
  }

  toKey(): string {
    return `${this._action}:${this._subject}`;
  }
}
