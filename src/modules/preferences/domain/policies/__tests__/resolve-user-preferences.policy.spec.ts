import { DashboardCard } from '../../enums/dashboard-card.enum';
import { DefaultMonth } from '../../enums/default-month.enum';
import { SpendingPerspective } from '../../enums/spending-perspective.enum';
import { resolveUserPreferences } from '../resolve-user-preferences.policy';

describe('resolveUserPreferences', () => {
  it('falls back to the purchase-date perspective, the current month, and no collapsed dashboard cards when nothing is stored', () => {
    expect(resolveUserPreferences(null)).toEqual({
      spendingPerspective: SpendingPerspective.PURCHASE_DATE,
      defaultMonth: DefaultMonth.CURRENT,
      collapsedDashboardCards: [],
      updatedAt: null,
    });
  });

  it('returns the stored preferences unchanged', () => {
    const stored = {
      spendingPerspective: SpendingPerspective.INVOICE_MONTH,
      defaultMonth: DefaultMonth.NEXT,
      collapsedDashboardCards: [DashboardCard.INVESTMENTS],
      updatedAt: new Date('2026-10-01T12:00:00Z'),
    };

    expect(resolveUserPreferences(stored)).toBe(stored);
  });
});
