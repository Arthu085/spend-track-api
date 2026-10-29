import { registeredRoutesOf } from '@test/support/http/registered-routes';
import { DashboardModule } from '../dashboard.module';

describe('DashboardModule routes', () => {
  it('registers the dashboard as an authenticated route', () => {
    expect(
      registeredRoutesOf(DashboardModule).map(
        ({ controller, route, isPublic }) => [controller, route, isPublic],
      ),
    ).toEqual([['DashboardController', 'GET /dashboard', false]]);
  });
});
