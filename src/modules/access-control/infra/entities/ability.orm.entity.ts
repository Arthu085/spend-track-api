import { BaseOrmEntity } from 'src/core/database/entities/base.orm.entity';
import { Column, Entity, Index, Unique } from 'typeorm';
import { ActionEnum } from '../../domain/enums/action.enum';
import { SubjectEnum } from '../../domain/enums/subject.enum';

@Entity('abilities', {
  comment: 'Tabela para armazenar as permissões dos usuários',
})
@Unique(['action', 'subject'])
export class AbilityOrmEntity extends BaseOrmEntity {
  @Column({
    type: 'enum',
    enum: ActionEnum,
    nullable: false,
    comment: 'Ação da permissão (CREATE, READ, etc)',
  })
  @Index()
  action: ActionEnum;

  @Column({
    type: 'enum',
    enum: SubjectEnum,
    nullable: false,
    comment: 'Recurso da permissão (USER, ROLE, etc)',
  })
  @Index()
  subject: SubjectEnum;
}
