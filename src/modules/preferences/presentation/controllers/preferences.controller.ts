import { Body, Controller } from '@nestjs/common';
import { endpoint } from '@shared/presentation/builders';
import {
  CurrentActor,
  Translator,
  type Translate,
} from '@shared/presentation/decorators';
import type { AuthenticatedUser } from '@shared/presentation/http';
import { GetPreferencesUseCase } from '../../application/use-cases/get-preferences.use-case';
import { UpdatePreferencesUseCase } from '../../application/use-cases/update-preferences.use-case';
import { UpdatePreferencesDto } from '../dto/input/update-preferences.dto';
import { PreferencesResponseDto } from '../dto/output/preferences.response';

@Controller('preferences')
export class PreferencesController {
  constructor(
    private readonly getPreferences: GetPreferencesUseCase,
    private readonly updatePreferences: UpdatePreferencesUseCase,
  ) {}

  @(endpoint()
    .get()
    .successMessage('success.ok')
    .tags('preferences')
    .summary("Get the authenticated user's financial preferences")
    .description(
      'Available to every authenticated user, without any ability, and always scoped to the caller. Returns the defaults (purchase-date perspective, current month) with a null updatedAt until the user saves preferences.',
    )
    .response(PreferencesResponseDto)
    .build())
  async findMine(
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<PreferencesResponseDto> {
    const preferences = await this.getPreferences.execute(actor.id);

    return PreferencesResponseDto.fromDomain(preferences, translate);
  }

  @(endpoint()
    .patch()
    .audit('Preferences.update')
    .successMessage('success.updated')
    .tags('preferences')
    .summary("Update the authenticated user's financial preferences")
    .description(
      'Partial update: omitted fields keep their current values. Changing the spending perspective only changes how months are grouped; it never changes stored dates.',
    )
    .body(UpdatePreferencesDto)
    .response(PreferencesResponseDto)
    .build())
  async updateMine(
    @Body() dto: UpdatePreferencesDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<PreferencesResponseDto> {
    const preferences = await this.updatePreferences.execute({
      userId: actor.id,
      spendingPerspective: dto.spendingPerspective,
      defaultMonth: dto.defaultMonth,
    });

    return PreferencesResponseDto.fromDomain(preferences, translate);
  }
}
