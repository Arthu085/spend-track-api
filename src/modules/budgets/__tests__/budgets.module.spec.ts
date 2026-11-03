import {
  registeredRoutesOf,
  shadowedRoutes,
} from '@test/support/http/registered-routes';
import { BudgetsModule } from '../budgets.module';

describe('BudgetsModule routes', () => {
  const routes = registeredRoutesOf(BudgetsModule);

  it('registers every budget route as an authenticated route', () => {
    expect(
      routes.map(({ controller, route, isPublic }) => [
        controller,
        route,
        isPublic,
      ]),
    ).toEqual([
      ['BudgetsController', 'GET /budgets/:year/:month', false],
      ['BudgetsController', 'PUT /budgets/:year/:month', false],
      ['BudgetsController', 'DELETE /budgets/:year/:month', false],
    ]);
  });

  it('registers no route behind an earlier route that already matches it', () => {
    expect(shadowedRoutes(routes)).toEqual([]);
  });
});
