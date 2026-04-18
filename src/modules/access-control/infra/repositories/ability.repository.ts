import { DataSource, In, Repository } from 'typeorm';
import { IAbilityRepository } from '../../domain/repositories/ability.repository.interface';
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
    const abilities = await this.repo
      .createQueryBuilder('ability')
      .orderBy('ability.subject', 'ASC')
      .addOrderBy('ability.action', 'ASC')
      .getMany();

    return abilities.map(AbilityMapper.toDomain);
  }

  async findByIds(ids: number[]): Promise<AbilityEntity[]> {
    if (!ids.length) return [];

    const abilities = await this.repo
      .createQueryBuilder('ability')
      .where('ability.id IN (:...ids)', { ids })
      .getMany();

    return abilities.map(AbilityMapper.toDomain);
  }

  async findByActionAndSubject(
    action: ActionEnum,
    subject: SubjectEnum,
  ): Promise<AbilityEntity | null> {
    const ability = await this.repo
      .createQueryBuilder('ability')
      .where('ability.action = :action', { action })
      .andWhere('ability.subject = :subject', { subject })
      .getOne();

    return ability ? AbilityMapper.toDomain(ability) : null;
  }
}
