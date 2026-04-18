import { AbilityEntity } from 'src/modules/access-control/domain/entities/ability.entity';
import {
  ActionEnum,
  ActionEnumTranslation,
} from 'src/modules/access-control/domain/enums/action.enum';
import {
  SubjectEnum,
  SubjectEnumTranslation,
} from 'src/modules/access-control/domain/enums/subject.enum';

export class AbilityResponseDto {
  action: ActionEnum;
  subject: SubjectEnum;
  labelAction: string;
  labelSubject: string;

  constructor(ability: AbilityEntity) {
    this.action = ability.action;
    this.subject = ability.subject;
    this.labelAction = ActionEnumTranslation[ability.action] ?? ability.action;
    this.labelSubject =
      SubjectEnumTranslation[ability.subject] ?? ability.subject;
  }
}
