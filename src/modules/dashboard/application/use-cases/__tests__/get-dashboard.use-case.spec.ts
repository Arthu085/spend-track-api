import type { AccountRepository } from '@modules/accounts';
import {
  DefaultMonth,
  SpendingPerspective,
  type UserPreferencesRepository,
} from '@modules/preferences';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { buildAccount } from '@test/support/builders/account.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import { PeriodTiming } from '../../../domain/period/month-period';
import { GetDashboardUseCase } from '../get-dashboard.use-case';

describe('GetDashboardUseCase', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-29T15:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function build(
    stored: Awaited<ReturnType<UserPreferencesRepository['findByUserId']>>,
    accounts = [
      buildAccount({ uuid: 'a', openingBalance: 150010 }),
      buildAccount({ uuid: 'b', openingBalance: -20 }),
    ],
  ) {
    const findAllByOwner = jest.fn().mockResolvedValue(accounts);

    const useCase = new GetDashboardUseCase(
      mockOf<AccountRepository>({ findAllByOwner }),
      mockOf<UserPreferencesRepository>({
        findByUserId: jest.fn().mockResolvedValue(stored),
      }),
    );

    return { useCase, findAllByOwner };
  }

  it("totals the caller's active account balances exactly", async () => {
    const { useCase, findAllByOwner } = build(null);

    const summary = await useCase.execute({ ownerId: 8 });

    expect(findAllByOwner).toHaveBeenCalledWith(8, {
      status: RecordStatus.ACTIVE,
    });
    expect(summary.balances).toEqual({ actual: 149990, projected: 149990 });
    expect(summary.accounts.map((entry) => entry.actualBalance)).toEqual([
      150010, -20,
    ]);
  });

  it('opens the current month with the stored perspective by default', async () => {
    const { useCase } = build(null);

    const summary = await useCase.execute({ ownerId: 8 });

    expect(summary.perspective).toBe(SpendingPerspective.PURCHASE_DATE);
    expect(summary.period).toMatchObject({
      year: 2026,
      month: 10,
      timing: PeriodTiming.CURRENT,
      remainingDays: 3,
    });
  });

  it('opens the next month when the user prefers it', async () => {
    const { useCase } = build({
      spendingPerspective: SpendingPerspective.INVOICE_MONTH,
      defaultMonth: DefaultMonth.NEXT,
      updatedAt: new Date(),
    });

    const summary = await useCase.execute({ ownerId: 8 });

    expect(summary.perspective).toBe(SpendingPerspective.INVOICE_MONTH);
    expect(summary.period).toMatchObject({
      year: 2026,
      month: 11,
      timing: PeriodTiming.FUTURE,
    });
  });

  it('uses the requested month and perspective without changing preferences', async () => {
    const { useCase } = build({
      spendingPerspective: SpendingPerspective.INVOICE_MONTH,
      defaultMonth: DefaultMonth.NEXT,
      updatedAt: new Date(),
    });

    const summary = await useCase.execute({
      ownerId: 8,
      year: 2025,
      month: 1,
      perspective: SpendingPerspective.PURCHASE_DATE,
    });

    expect(summary.perspective).toBe(SpendingPerspective.PURCHASE_DATE);
    expect(summary.period).toMatchObject({
      year: 2025,
      month: 1,
      timing: PeriodTiming.PAST,
      remainingDays: 0,
    });
  });

  it('reports zero balances when the user has no account yet', async () => {
    const { useCase } = build(null, []);

    const summary = await useCase.execute({ ownerId: 8 });

    expect(summary.balances).toEqual({ actual: 0, projected: 0 });
    expect(summary.accounts).toEqual([]);
  });
});
