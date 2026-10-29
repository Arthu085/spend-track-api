import { Inject, Injectable } from '@nestjs/common';
import { DefaultMonth } from '../../domain/enums/default-month.enum';
import { SpendingPerspective } from '../../domain/enums/spending-perspective.enum';
import {
  resolveUserPreferences,
  type UserPreferences,
} from '../../domain/policies/resolve-user-preferences.policy';
import {
  USER_PREFERENCES_REPOSITORY,
  type UserPreferencesRepository,
} from '../../domain/repositories/user-preferences.repository';

export interface UpdatePreferencesInput {
  userId: number;
  spendingPerspective?: SpendingPerspective;
  defaultMonth?: DefaultMonth;
}

@Injectable()
export class UpdatePreferencesUseCase {
  constructor(
    @Inject(USER_PREFERENCES_REPOSITORY)
    private readonly preferencesRepository: UserPreferencesRepository,
  ) {}

  async execute(input: UpdatePreferencesInput): Promise<UserPreferences> {
    const current = resolveUserPreferences(
      await this.preferencesRepository.findByUserId(input.userId),
    );

    return this.preferencesRepository.save(input.userId, {
      spendingPerspective:
        input.spendingPerspective ?? current.spendingPerspective,
      defaultMonth: input.defaultMonth ?? current.defaultMonth,
    });
  }
}
