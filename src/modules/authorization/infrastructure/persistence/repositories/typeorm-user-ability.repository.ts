import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AbilityPair } from '@shared/domain/authorization/ability-pair.type';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { BaseTransactionalRepository } from '@shared/infrastructure/persistence';
import type { UserAbilityRepository } from '../../../domain/repositories/user-ability.repository';
import { AbilityOrmEntity } from '../entities/ability.orm-entity';

@Injectable()
export class TypeOrmUserAbilityRepository
  extends BaseTransactionalRepository<AbilityOrmEntity>
  implements UserAbilityRepository
{
  constructor(
    @InjectRepository(AbilityOrmEntity)
    repository: Repository<AbilityOrmEntity>,
  ) {
    super(repository);
  }

  async findGrantedAbilities(userUuid: string): Promise<AbilityPair[]> {
    const rows = await this.repository
      .createQueryBuilder('ability')
      .where('ability.deletedAt IS NULL')
      .andWhere('ability.status = :abilityActiveStatus', {
        abilityActiveStatus: RecordStatus.ACTIVE,
      })
      .andWhere(
        `ability.id IN (
          SELECT 
            role_abilities.ability_id
          FROM role_abilities
            INNER JOIN roles ON roles.id = role_abilities.role_id
            INNER JOIN user_roles ON user_roles.role_id = roles.id
            INNER JOIN users ON users.id = user_roles.user_id
          WHERE users.uuid = :userUuid
            AND users.deleted_at IS NULL
            AND users.status = :userActiveStatus
            AND roles.deleted_at IS NULL
            AND roles.status = :roleActiveStatus
        )`,
        {
          userUuid,
          userActiveStatus: RecordStatus.ACTIVE,
          roleActiveStatus: RecordStatus.ACTIVE,
        },
      )
      .getMany();

    return rows.map((row) => ({ action: row.action, subject: row.subject }));
  }
}
