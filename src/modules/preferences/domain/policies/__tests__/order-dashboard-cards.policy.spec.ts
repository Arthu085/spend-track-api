import { DashboardCard } from '../../enums/dashboard-card.enum';
import { orderDashboardCards } from '../order-dashboard-cards.policy';

describe('orderDashboardCards', () => {
  it('returns the cards in enum order without duplicates', () => {
    expect(
      orderDashboardCards([
        DashboardCard.ACCOUNT_BALANCES,
        DashboardCard.OVERVIEW,
        DashboardCard.BUDGET,
        DashboardCard.OVERVIEW,
      ]),
    ).toEqual([
      DashboardCard.OVERVIEW,
      DashboardCard.BUDGET,
      DashboardCard.ACCOUNT_BALANCES,
    ]);
  });

  it('returns an empty list for no cards', () => {
    expect(orderDashboardCards([])).toEqual([]);
  });
});
