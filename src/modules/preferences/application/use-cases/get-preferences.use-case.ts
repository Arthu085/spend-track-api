import { Inject, Injectable } from '@nestjs/common';
import {
  resolveUserPreferences,
  type UserPreferences,
} from '../../domain/policies/resolve-user-preferences.policy';
import {
  USER_PREFERENCES_REPOSITORY,
  type UserPreferencesRepository,
} from '../../domain/repositories/user-preferences.repository';

@Injectable()
export class GetPreferencesUseCase {
  constructor(
    @Inject(USER_PREFERENCES_REPOSITORY)
    private readonly preferencesRepository: UserPreferencesRepository,
  ) {}

  async execute(userId: number): Promise<UserPreferences> {
    return resolveUserPreferences(
      await this.preferencesRepository.findByUserId(userId),
    );
  }
}
