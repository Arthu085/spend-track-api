import { AdditionalContributionStrategy } from '../../enums/additional-contribution-strategy.enum';
import { savingPlanOf, type SavingPlanInput } from '../saving-plan';

const plan = (overrides: Partial<SavingPlanInput> = {}) =>
  savingPlanOf({
    strategy: {
      minimumRetainedBalance: 20000,
      additionalContribution: AdditionalContributionStrategy.REMAINING_SURPLUS,
    },
    actualBalance: 150000,
    plannedTransactions: 0,
    plannedMovements: -70000,
    ownPlannedMandatory: 70000,
    cardObligations: 0,
    monthClosed: false,
    hasLiveAdditional: false,
    ...overrides,
  });

describe('savingPlanOf', () => {
  it('suggests what remains after the mandatory contribution and the retained balance', () => {
    expect(plan()).toEqual({
      otherInvestmentMovements: 0,
      balanceBeforeContribution: 150000,
      distributable: 130000,
      shortfall: 0,
      suggestedAdditional: 60000,
      canAcceptAdditional: true,
    });
  });

  it('keeps the suggestion once the mandatory contribution is confirmed', () => {
    expect(
      plan({
        actualBalance: 80000,
        plannedMovements: 0,
        ownPlannedMandatory: 0,
      }),
    ).toMatchObject({
      balanceBeforeContribution: 80000,
      distributable: 60000,
      shortfall: 0,
      suggestedAdditional: 60000,
    });
  });

  it('suggests nothing more after accepting the additional contribution as planned', () => {
    expect(
      plan({ plannedMovements: -130000, hasLiveAdditional: true }),
    ).toEqual({
      otherInvestmentMovements: -60000,
      balanceBeforeContribution: 90000,
      distributable: 70000,
      shortfall: 0,
      suggestedAdditional: 0,
      canAcceptAdditional: false,
    });
  });

  it('never counts the own mandatory contribution twice while other movements still reduce the balance', () => {
    expect(plan({ plannedMovements: -80000 })).toMatchObject({
      otherInvestmentMovements: -10000,
      balanceBeforeContribution: 140000,
      distributable: 120000,
      suggestedAdditional: 50000,
    });
  });

  it('adds planned transactions and subtracts card obligations', () => {
    expect(
      plan({ plannedTransactions: 10000, cardObligations: 25000 }),
    ).toMatchObject({
      balanceBeforeContribution: 135000,
      distributable: 115000,
      suggestedAdditional: 45000,
    });
  });

  it('reports the shortfall and no suggestion when the mandatory contribution does not fit', () => {
    expect(plan({ actualBalance: 50000 })).toMatchObject({
      balanceBeforeContribution: 50000,
      distributable: 30000,
      shortfall: 40000,
      suggestedAdditional: 0,
    });
  });

  it('reports the whole mandatory plus the deficit when the retained balance is already out of reach', () => {
    expect(plan({ actualBalance: 10000 })).toMatchObject({
      distributable: -10000,
      shortfall: 80000,
      suggestedAdditional: 0,
    });
  });

  it('suggests nothing for a past month, while still computing the figures', () => {
    expect(plan({ monthClosed: true })).toMatchObject({
      distributable: 130000,
      suggestedAdditional: 0,
      canAcceptAdditional: false,
    });
  });

  it('suggests nothing without the remaining surplus strategy', () => {
    expect(
      plan({
        strategy: {
          minimumRetainedBalance: 20000,
          additionalContribution: AdditionalContributionStrategy.NONE,
        },
      }),
    ).toMatchObject({
      distributable: 130000,
      suggestedAdditional: 0,
      canAcceptAdditional: false,
    });
  });

  it('can still accept an additional contribution when nothing is suggested', () => {
    expect(plan({ actualBalance: 50000 }).canAcceptAdditional).toBe(true);
  });
});
