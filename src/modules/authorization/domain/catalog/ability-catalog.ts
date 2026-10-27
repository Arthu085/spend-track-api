import { Action } from '@shared/domain/enums/action.enum';
import { Subject } from '@shared/domain/authorization/subject';
import type { AbilityPair } from '@shared/domain/authorization/ability-pair.type';
import { RoleEnum } from '../enums/role.enum';

export const ABILITY_CATALOG: AbilityPair[] = [
  { action: Action.CREATE, subject: Subject.USER },
  { action: Action.READ, subject: Subject.USER },
  { action: Action.UPDATE, subject: Subject.USER },
  { action: Action.DELETE, subject: Subject.USER },
  { action: Action.CREATE, subject: Subject.ROLE },
  { action: Action.READ, subject: Subject.ROLE },
  { action: Action.UPDATE, subject: Subject.ROLE },
  { action: Action.DELETE, subject: Subject.ROLE },
  { action: Action.CREATE, subject: Subject.ABILITY },
  { action: Action.READ, subject: Subject.ABILITY },
  { action: Action.UPDATE, subject: Subject.ABILITY },
  { action: Action.DELETE, subject: Subject.ABILITY },
];

export const ROLE_ABILITY_GRANTS: Record<RoleEnum, AbilityPair[]> = {
  [RoleEnum.ADMIN]: ABILITY_CATALOG,
  [RoleEnum.USER]: [{ action: Action.READ, subject: Subject.USER }],
};
