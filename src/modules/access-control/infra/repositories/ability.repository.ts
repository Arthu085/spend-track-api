import { DataSource, Repository } from 'typeorm';
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

    return abilities.map((ability) => AbilityMapper.toDomain(ability));
  }

  async findByActionsAndSubjects(
    items: { action: ActionEnum; subject: SubjectEnum }[],
  ): Promise<AbilityEntity[]> {
    if (!items.length) return [];

    const qb = this.repo.createQueryBuilder('ability');

    const conditions = items
      .map(
        (_, index) =>
          `(ability.action = :action${index} AND ability.subject = :subject${index})`,
      )
      .join(' OR ');

    const params = items.reduce(
      (acc, item, index) => {
        acc[`action${index}`] = item.action;
        acc[`subject${index}`] = item.subject;
        return acc;
      },
      {} as Record<string, any>,
    );

    const abilities = await qb.where(conditions, params).getMany();

    return abilities.map((ability) => AbilityMapper.toDomain(ability));
  }
}
