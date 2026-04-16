import { BaseOrmEntity } from 'src/core/database/entities/base.orm.entity';
import { Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { RoleOrmEntity } from './role.orm.entity';
import { AbilityOrmEntity } from './ability.orm.entity';

@Entity('role_abilities', {
  comment: 'Tabela de associação entre funções e permissões',
})
@Unique(['role', 'ability'])
export class RoleAbilityOrmEntity extends BaseOrmEntity {
  @ManyToOne(() => RoleOrmEntity, (role) => role.roleAbilities)
  @JoinColumn({ name: 'role_id' })
  @Index()
  role: RoleOrmEntity;

  @ManyToOne(() => AbilityOrmEntity)
  @JoinColumn({ name: 'ability_id' })
  @Index()
  ability: AbilityOrmEntity;
}
