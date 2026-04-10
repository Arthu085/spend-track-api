import { AbilityEntity } from '../entities/ability.entity';
import { ActionEnum } from '../enums/action.enum';
import { SubjectEnum } from '../enums/subject.enum';

export interface IAbilityRepository {
  findAll(): Promise<AbilityEntity[]>;

  findByIds(id: number[]): Promise<AbilityEntity[]>;

  findByActionAndSubject(
    action: ActionEnum,
    subject: SubjectEnum,
  ): Promise<AbilityEntity | null>;
}
