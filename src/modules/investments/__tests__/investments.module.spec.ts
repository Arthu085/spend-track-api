import {
  registeredRoutesOf,
  shadowedRoutes,
} from '@test/support/http/registered-routes';
import { InvestmentsModule } from '../investments.module';

describe('InvestmentsModule routes', () => {
  const routes = registeredRoutesOf(InvestmentsModule);

  it('registers every investment route as an authenticated route', () => {
    expect(
      routes.map(({ controller, route, isPublic }) => [
        controller,
        route,
        isPublic,
      ]),
    ).toEqual([
      ['InvestmentsController', 'GET /investments', false],
      ['InvestmentsController', 'GET /investments/:uuid', false],
      ['InvestmentsController', 'POST /investments', false],
      ['InvestmentsController', 'PATCH /investments/:uuid', false],
      ['InvestmentsController', 'PUT /investments/:uuid/status', false],
      ['InvestmentsController', 'DELETE /investments/:uuid', false],
      [
        'InvestmentMovementsController',
        'GET /investments/:uuid/movements',
        false,
      ],
      [
        'InvestmentMovementsController',
        'POST /investments/:uuid/movements',
        false,
      ],
      [
        'InvestmentMovementsController',
        'POST /investments/:uuid/valuations',
        false,
      ],
      [
        'InvestmentMovementsController',
        'PUT /investments/:uuid/movements/:movementUuid/state',
        false,
      ],
    ]);
  });

  it('registers no route behind an earlier route that already matches it', () => {
    expect(shadowedRoutes(routes)).toEqual([]);
  });
});
