import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AbilityPair } from '@shared/domain/authorization/ability-pair.type';
import { BaseTransactionalRepository } from '@shared/infrastructure/persistence';
import { AbilityEntity } from '../../../domain/entities/ability.entity';
import type { AbilityRepository } from '../../../domain/repositories/ability.repository';
import { AbilityOrmEntity } from '../entities/ability.orm-entity';
import { AbilityMapper } from '../mappers/ability.mapper';

@Injectable()
export class TypeOrmAbilityRepository
  extends BaseTransactionalRepository<AbilityOrmEntity>
  implements AbilityRepository
{
  constructor(
    @InjectRepository(AbilityOrmEntity)
    repository: Repository<AbilityOrmEntity>,
  ) {
    super(repository);
  }

  async findAll(): Promise<AbilityEntity[]> {
    const abilities = await this.repository.find();

    return abilities.map((ability) => AbilityMapper.toDomain(ability));
  }

  async findByPairs(pairs: AbilityPair[]): Promise<AbilityEntity[]> {
    if (pairs.length === 0) {
      return [];
    }

    const abilities = await this.repository.find({ where: pairs });

    return abilities.map((ability) => AbilityMapper.toDomain(ability));
  }
}
