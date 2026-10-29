import { ApiProperty } from '@nestjs/swagger';
import { translateOrFallback } from '@shared/presentation/http';
import { DefaultMonth } from '../../../domain/enums/default-month.enum';
import { SpendingPerspective } from '../../../domain/enums/spending-perspective.enum';
import type { UserPreferences } from '../../../domain/policies/resolve-user-preferences.policy';

export class PreferencesResponseDto {
  @ApiProperty({ enum: SpendingPerspective })
  spendingPerspective!: SpendingPerspective;

  @ApiProperty()
  spendingPerspectiveLabel!: string;

  @ApiProperty({ enum: DefaultMonth })
  defaultMonth!: DefaultMonth;

  @ApiProperty()
  defaultMonthLabel!: string;

  @ApiProperty({
    type: Date,
    nullable: true,
    description: 'Null while the user still has the default preferences.',
  })
  updatedAt!: Date | null;

  static fromDomain(
    preferences: UserPreferences,
    translate: (key: string) => string,
  ): PreferencesResponseDto {
    const dto = new PreferencesResponseDto();

    dto.spendingPerspective = preferences.spendingPerspective;
    dto.spendingPerspectiveLabel = spendingPerspectiveLabel(
      preferences.spendingPerspective,
      translate,
    );
    dto.defaultMonth = preferences.defaultMonth;
    dto.defaultMonthLabel = translateOrFallback(
      translate,
      `preferences.default_month.${preferences.defaultMonth.toLowerCase()}`,
      preferences.defaultMonth,
    );
    dto.updatedAt = preferences.updatedAt;

    return dto;
  }
}

export function spendingPerspectiveLabel(
  perspective: SpendingPerspective,
  translate: (key: string) => string,
): string {
  return translateOrFallback(
    translate,
    `preferences.spending_perspective.${perspective.toLowerCase()}`,
    perspective,
  );
}
