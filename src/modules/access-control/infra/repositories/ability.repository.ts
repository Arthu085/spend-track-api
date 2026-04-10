import { DataSource, In, Repository } from 'typeorm';
import { IAbilityRepository } from '../../domain/repositories/ability.repository';
import { AbilityOrmEntity } from '../entities/ability.orm.entity';
import { AbilityMapper } from '../mappers/ability.mapper';
import { AbilityEntity } from '../../domain/entities/ability.entity';
import { ActionEnum } from '../../domain/enums/action.enum';
import { SubjectEnum } from '../../domain/enums/subject.enum';

export class AbilityRepository implements IAbilityRepository {
  private repo: Repository<AbilityOrmEntity>;

  constructor(private readonly dataSource: DataSource) {
    this.repo = this.dataSource.getRepository(AbilityOrmEntity);
  }

  async findAll(): Promise<AbilityEntity[]> {
    const abilities = await this.repo.find({
      order: {
        subject: 'ASC',
        action: 'ASC',
      },
    });

    return abilities.map(AbilityMapper.toDomain);
  }

  async findByIds(ids: number[]): Promise<AbilityEntity[]> {
    if (!ids.length) return [];

    const abilities = await this.repo.findBy({
      id: In(ids),
    });

    return abilities.map(AbilityMapper.toDomain);
  }

  async findByActionAndSubject(
    action: ActionEnum,
    subject: SubjectEnum,
  ): Promise<AbilityEntity | null> {
    const ability = await this.repo.findOneBy({
      action,
      subject,
    });

    return ability ? AbilityMapper.toDomain(ability) : null;
  }
}
