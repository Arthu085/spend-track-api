import { DefaultMonth } from '../enums/default-month.enum';
import { SpendingPerspective } from '../enums/spending-perspective.enum';

export const USER_PREFERENCES_REPOSITORY = Symbol(
  'USER_PREFERENCES_REPOSITORY',
);

export interface UserPreferenceValues {
  spendingPerspective: SpendingPerspective;
  defaultMonth: DefaultMonth;
}

export interface StoredUserPreferences extends UserPreferenceValues {
  updatedAt: Date;
}

export interface UserPreferencesRepository {
  findByUserId(userId: number): Promise<StoredUserPreferences | null>;
  save(
    userId: number,
    values: UserPreferenceValues,
  ): Promise<StoredUserPreferences>;
}
