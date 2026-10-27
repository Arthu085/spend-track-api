import { Column, Entity, Index } from 'typeorm';
import { Subject } from '@shared/domain/authorization/subject';
import { Action } from '@shared/domain/enums/action.enum';
import { BaseOrmEntity } from '@shared/infrastructure/persistence/base.orm-entity';

@Entity('abilities')
@Index('uq_abilities_action_subject', ['action', 'subject'], { unique: true })
export class AbilityOrmEntity extends BaseOrmEntity {
  @Column({
    name: 'action',
    type: 'enum',
    enum: Action,
    nullable: false,
    comment: 'Action half of the fixed (Action, Subject) ability pair.',
  })
  action!: Action;

  @Column({
    name: 'subject',
    type: 'enum',
    enum: Subject,
    nullable: false,
    comment: 'Subject half of the fixed (Action, Subject) ability pair.',
  })
  subject!: Subject;
}
