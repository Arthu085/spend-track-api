import { AbilityEntity } from '../entities/ability.entity';
import { ActionEnum } from '../../../../core/domain/enums/action.enum';
import { SubjectEnum } from '../../../../core/domain/enums/subject.enum';

export interface IAbilityRepository {
  findAll(): Promise<AbilityEntity[]>;

  findByActionsAndSubjects(
    items: { action: ActionEnum; subject: SubjectEnum }[],
  ): Promise<AbilityEntity[]>;
}
