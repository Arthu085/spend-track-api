import { Action } from '../enums/action.enum';
import { Subject } from './subject';

export interface AbilityPair {
  action: Action;
  subject: Subject;
}
