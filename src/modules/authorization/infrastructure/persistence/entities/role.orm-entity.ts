import { Column, Entity, JoinTable, ManyToMany } from 'typeorm';
import { BaseOrmEntity } from '@shared/infrastructure/persistence/base.orm-entity';
import { RoleEnum } from '@modules/authorization/domain/enums/role.enum';
import { AbilityOrmEntity } from './ability.orm-entity';

@Entity('roles')
export class RoleOrmEntity extends BaseOrmEntity {
  @Column({
    name: 'name',
    type: 'enum',
    enum: RoleEnum,
    unique: true,
    nullable: false,
    comment: 'Stable code-defined role identifier (RoleKey enum).',
  })
  name!: RoleEnum;

  @ManyToMany(() => AbilityOrmEntity)
  @JoinTable({
    name: 'role_abilities',
    joinColumn: { name: 'role_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'ability_id', referencedColumnName: 'id' },
  })
  abilities!: AbilityOrmEntity[];
}
