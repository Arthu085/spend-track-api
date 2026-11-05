import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, Matches } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { NON_NEGATIVE_MONEY_PATTERN } from '@modules/investments/presentation';
import { MoneyField } from '@shared/presentation/dto';
import { AdditionalContributionStrategy } from '../../../domain/enums/additional-contribution-strategy.enum';

export class SavingStrategyDto {
  @MoneyField({
    example: '200.00',
    description:
      'Balance to keep in the account before anything is suggested as an additional contribution; zero or more.',
  })
  @Matches(NON_NEGATIVE_MONEY_PATTERN, {
    message: i18nValidationMessage('validation.IS_MONEY'),
  })
  minimumRetainedBalance!: string;

  @ApiProperty({
    enum: AdditionalContributionStrategy,
    description:
      'REMAINING_SURPLUS suggests what is left of the month after the mandatory contribution and the retained balance; NONE suggests nothing.',
  })
  @IsEnum(AdditionalContributionStrategy, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  additionalContribution!: AdditionalContributionStrategy;
}
