import { BaseOrmEntity } from 'src/core/database/entities/base.orm.entity';
import { RoleOrmEntity } from 'src/modules/access-control/infra/entities/role.orm.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

@Entity('users', { comment: 'Tabela de usuários do sistema' })
export class UserOrmEntity extends BaseOrmEntity {
  @Column({
    name: 'full_name',
    length: 255,
    nullable: false,
    comment: 'Nome completo do usuário',
  })
  @Index()
  fullName!: string;

  @Column({
    name: 'email',
    length: 255,
    nullable: false,
    unique: true,
    comment: 'Endereço de email do usuário',
  })
  @Index()
  email!: string;

  @Column({
    name: 'password',
    length: 255,
    nullable: false,
    comment: 'Senha do usuário (armazenada com hash)',
  })
  password!: string;

  @ManyToOne(() => RoleOrmEntity, (role) => role.users, { nullable: false })
  @JoinColumn({ name: 'role_id' })
  @Index()
  role!: RoleOrmEntity;

  @Column({ name: 'role_id' })
  roleId!: number;
}
