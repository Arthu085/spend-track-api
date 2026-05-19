import {
  ActionEnum,
  ActionEnumTranslation,
} from 'src/core/domain/enums/action.enum';
import {
  SubjectEnum,
  SubjectEnumTranslation,
} from 'src/core/domain/enums/subject.enum';

export class CheckPermissionResponseDto {
  allowed: boolean;
  missingPermissions: {
    action: ActionEnum;
    subject: SubjectEnum;
    actionLabel: string;
    subjectLabel: string;
  }[];

  constructor(
    allowed: boolean,
    missingPermissions: {
      action: ActionEnum;
      subject: SubjectEnum;
    }[] = [],
  ) {
    this.allowed = allowed;
    this.missingPermissions = missingPermissions.map((permission) => ({
      action: permission.action,
      subject: permission.subject,
      actionLabel:
        ActionEnumTranslation[permission.action] ?? permission.action,
      subjectLabel:
        SubjectEnumTranslation[permission.subject] ?? permission.subject,
    }));
  }
}
