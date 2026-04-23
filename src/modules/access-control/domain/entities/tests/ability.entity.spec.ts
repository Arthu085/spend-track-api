import { AbilityEntity } from '../ability.entity';
import { ActionEnum } from '../../enums/action.enum';
import { SubjectEnum } from '../../enums/subject.enum';

describe('AbilityEntity', () => {
  it('Deve criar uma habilidade com nome válido', () => {
    const ability = AbilityEntity.create({
      action: ActionEnum.CREATE,
      subject: SubjectEnum.ROLE,
    });
    expect(ability.action).toBe(ActionEnum.CREATE);
    expect(ability.subject).toBe(SubjectEnum.ROLE);
  });
});
