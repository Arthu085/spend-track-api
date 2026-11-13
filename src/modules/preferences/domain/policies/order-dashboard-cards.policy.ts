import { DashboardCard } from '../enums/dashboard-card.enum';

export function orderDashboardCards(
  cards: readonly DashboardCard[],
): DashboardCard[] {
  return Object.values(DashboardCard).filter((card) => cards.includes(card));
}
