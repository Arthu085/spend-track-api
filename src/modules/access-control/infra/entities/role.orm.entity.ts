import { BaseOrmEntity } from 'src/core/database/entities/base.orm.entity';
import { Column, Entity, OneToMany } from 'typeorm';
import { RoleEnum } from '../../domain/enums/role.enum';
import { RoleAbilityOrmEntity } from './role-ability.orm.entity';
import { UserOrmEntity } from 'src/modules/user/infra/entities/user.orm.entity';

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

  @OneToMany(() => RoleAbilityOrmEntity, (ra) => ra.role)
  roleAbilities: RoleAbilityOrmEntity[];

  @OneToMany(() => UserOrmEntity, (user) => user.role)
  users: UserOrmEntity[];
}
