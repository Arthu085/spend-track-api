import {
  registeredRoutesOf,
  shadowedRoutes,
} from '@test/support/http/registered-routes';
import { TransactionsModule } from '../transactions.module';

describe('TransactionsModule routes', () => {
  const routes = registeredRoutesOf(TransactionsModule);

  it('registers every transactions route as an authenticated route', () => {
    expect(
      routes.map(({ controller, route, isPublic }) => [
        controller,
        route,
        isPublic,
      ]),
    ).toEqual([
      ['TransactionsController', 'GET /transactions', false],
      ['TransactionsController', 'GET /transactions/:uuid', false],
      ['TransactionsController', 'POST /transactions', false],
      ['TransactionsController', 'PATCH /transactions/:uuid', false],
      ['TransactionsController', 'PUT /transactions/:uuid/state', false],
      ['TransactionsController', 'DELETE /transactions/:uuid', false],
    ]);
  });

  it('registers no route behind an earlier route that already matches it', () => {
    expect(shadowedRoutes(routes)).toEqual([]);
  });
});
