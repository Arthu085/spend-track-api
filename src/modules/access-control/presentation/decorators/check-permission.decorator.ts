import { SetMetadata } from '@nestjs/common';
import { ActionEnum } from '../../domain/enums/action.enum';
import { SubjectEnum } from '../../domain/enums/subject.enum';

export const CHECK_PERMISSIONS_KEY = 'check_permissions';

export interface ICheckPermission {
  action: ActionEnum;
  subject: SubjectEnum;
}

export const CheckPermissions = (permissions: ICheckPermission[]) =>
  SetMetadata(CHECK_PERMISSIONS_KEY, permissions);
