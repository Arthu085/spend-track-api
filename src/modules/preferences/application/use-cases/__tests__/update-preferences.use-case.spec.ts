import { mockOf } from '@test/support/mocks/mock-of';
import { DashboardCard } from '../../../domain/enums/dashboard-card.enum';
import { DefaultMonth } from '../../../domain/enums/default-month.enum';
import { SpendingPerspective } from '../../../domain/enums/spending-perspective.enum';
import type { UserPreferencesRepository } from '../../../domain/repositories/user-preferences.repository';
import { UpdatePreferencesUseCase } from '../update-preferences.use-case';

describe('UpdatePreferencesUseCase', () => {
  function build(
    stored: Awaited<ReturnType<UserPreferencesRepository['findByUserId']>>,
  ) {
    const save = jest.fn(
      (
        _userId: number,
        values: Parameters<UserPreferencesRepository['save']>[1],
      ) => Promise.resolve({ ...values, updatedAt: new Date() }),
    );

    const useCase = new UpdatePreferencesUseCase(
      mockOf<UserPreferencesRepository>({
        findByUserId: jest.fn().mockResolvedValue(stored),
        save,
      }),
    );

    return { useCase, save };
  }

  it('starts from the defaults when nothing is stored and applies the sent fields', async () => {
    const { useCase, save } = build(null);

    await useCase.execute({
      userId: 3,
      spendingPerspective: SpendingPerspective.INVOICE_MONTH,
    });

    expect(save).toHaveBeenCalledWith(3, {
      spendingPerspective: SpendingPerspective.INVOICE_MONTH,
      defaultMonth: DefaultMonth.CURRENT,
      collapsedDashboardCards: [],
    });
  });

  it('keeps the stored value of every omitted field', async () => {
    const { useCase, save } = build({
      spendingPerspective: SpendingPerspective.INVOICE_MONTH,
      defaultMonth: DefaultMonth.CURRENT,
      collapsedDashboardCards: [DashboardCard.BUDGET],
      updatedAt: new Date(),
    });

    await useCase.execute({ userId: 3, defaultMonth: DefaultMonth.NEXT });

    expect(save).toHaveBeenCalledWith(3, {
      spendingPerspective: SpendingPerspective.INVOICE_MONTH,
      defaultMonth: DefaultMonth.NEXT,
      collapsedDashboardCards: [DashboardCard.BUDGET],
    });
  });

  it('replaces the whole collapsed card list and stores it in enum order', async () => {
    const { useCase, save } = build({
      spendingPerspective: SpendingPerspective.INVOICE_MONTH,
      defaultMonth: DefaultMonth.NEXT,
      collapsedDashboardCards: [DashboardCard.OVERVIEW, DashboardCard.BUDGET],
      updatedAt: new Date(),
    });

    await useCase.execute({
      userId: 3,
      collapsedDashboardCards: [
        DashboardCard.ACCOUNT_BALANCES,
        DashboardCard.INCOME,
      ],
    });

    expect(save).toHaveBeenCalledWith(3, {
      spendingPerspective: SpendingPerspective.INVOICE_MONTH,
      defaultMonth: DefaultMonth.NEXT,
      collapsedDashboardCards: [
        DashboardCard.INCOME,
        DashboardCard.ACCOUNT_BALANCES,
      ],
    });
  });

  it('clears the collapsed card list when an empty list is sent', async () => {
    const { useCase, save } = build({
      spendingPerspective: SpendingPerspective.INVOICE_MONTH,
      defaultMonth: DefaultMonth.NEXT,
      collapsedDashboardCards: [DashboardCard.BUDGET],
      updatedAt: new Date(),
    });

    await useCase.execute({ userId: 3, collapsedDashboardCards: [] });

    expect(save).toHaveBeenCalledWith(3, {
      spendingPerspective: SpendingPerspective.INVOICE_MONTH,
      defaultMonth: DefaultMonth.NEXT,
      collapsedDashboardCards: [],
    });
  });
});
