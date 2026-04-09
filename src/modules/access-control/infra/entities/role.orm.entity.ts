import { BaseOrmEntity } from 'src/core/database/entities/base.orm.entity';
import { Column, Entity } from 'typeorm';
import { RoleEnum } from '../../domain/enums/role.enum';

@Entity('roles', { comment: 'Tabela de funções do sistema' })
export class RoleOrmEntity extends BaseOrmEntity {
  @Column({
    type: 'enum',
    enum: RoleEnum,
    unique: true,
    nullable: false,
    comment: 'Nome da função',
  })
  name: RoleEnum;
}
