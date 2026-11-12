import { Action } from '../../domain/enums/action.enum';

export interface RequiredAbilityView {
  action: Action;
  actionLabel: string;
  subject: string;
  subjectLabel: string;
}

export interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string;
  timestamp: string;
  path: string;
  requiredAbilities?: RequiredAbilityView[];
  auditId?: string;
}

export type ValidationErrorResponseBody = Omit<
  ErrorResponseBody,
  'message' | 'requiredAbilities' | 'auditId'
> & {
  message: string[];
};
