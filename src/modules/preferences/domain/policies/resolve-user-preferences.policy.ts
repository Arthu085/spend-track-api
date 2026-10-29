import { DefaultMonth } from '../enums/default-month.enum';
import { SpendingPerspective } from '../enums/spending-perspective.enum';
import type {
  StoredUserPreferences,
  UserPreferenceValues,
} from '../repositories/user-preferences.repository';

export interface UserPreferences extends UserPreferenceValues {
  updatedAt: Date | null;
}

export const DEFAULT_USER_PREFERENCES: UserPreferenceValues = {
  spendingPerspective: SpendingPerspective.PURCHASE_DATE,
  defaultMonth: DefaultMonth.CURRENT,
};

export function resolveUserPreferences(
  stored: StoredUserPreferences | null,
): UserPreferences {
  return stored ?? { ...DEFAULT_USER_PREFERENCES, updatedAt: null };
}
