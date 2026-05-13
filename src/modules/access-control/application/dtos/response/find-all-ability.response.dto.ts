import { AbilityEntity } from 'src/modules/access-control/domain/entities/ability.entity';
import {
  ActionEnum,
  ActionEnumTranslation,
} from 'src/core/domain/enums/action.enum';
import {
  SubjectEnum,
  SubjectEnumTranslation,
} from 'src/core/domain/enums/subject.enum';

export class FindAllAbilityResponseDto {
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
