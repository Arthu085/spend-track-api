import { AdditionalContributionStrategy } from '../enums/additional-contribution-strategy.enum';

export interface SavingStrategy {
  minimumRetainedBalance: number;
  additionalContribution: AdditionalContributionStrategy;
}

export interface SavingPlanInput {
  strategy: SavingStrategy;
  actualBalance: number;
  plannedTransactions: number;
  plannedMovements: number;
  ownPlannedMandatory: number;
  cardObligations: number;
  monthClosed: boolean;
  hasLiveAdditional: boolean;
}

export interface SavingPlanFigures {
  otherInvestmentMovements: number;
  balanceBeforeContribution: number;
  distributable: number;
  shortfall: number;
  suggestedAdditional: number;
  canAcceptAdditional: boolean;
}

export function savingPlanOf(input: SavingPlanInput): SavingPlanFigures {
  const otherInvestmentMovements =
    input.plannedMovements + input.ownPlannedMandatory;

  const balanceBeforeContribution =
    input.actualBalance +
    input.plannedTransactions +
    otherInvestmentMovements -
    input.cardObligations;

  const distributable =
    balanceBeforeContribution - input.strategy.minimumRetainedBalance;

  const canAcceptAdditional =
    input.strategy.additionalContribution ===
      AdditionalContributionStrategy.REMAINING_SURPLUS &&
    !input.monthClosed &&
    !input.hasLiveAdditional;

  return {
    otherInvestmentMovements,
    balanceBeforeContribution,
    distributable,
    shortfall: Math.max(input.ownPlannedMandatory - distributable, 0),
    suggestedAdditional: canAcceptAdditional
      ? Math.max(distributable - input.ownPlannedMandatory, 0)
      : 0,
    canAcceptAdditional,
  };
}
