import {
  registeredRoutesOf,
  shadowedRoutes,
} from '@test/support/http/registered-routes';
import { AccountsModule } from '../accounts.module';

describe('AccountsModule routes', () => {
  const routes = registeredRoutesOf(AccountsModule);

  it('registers every accounts route as an authenticated route', () => {
    expect(
      routes.map(({ controller, route, isPublic }) => [
        controller,
        route,
        isPublic,
      ]),
    ).toEqual([
      ['AccountsController', 'GET /accounts', false],
      ['AccountsController', 'GET /accounts/:uuid', false],
      ['AccountsController', 'POST /accounts', false],
      ['AccountsController', 'PATCH /accounts/:uuid', false],
      ['AccountsController', 'PUT /accounts/:uuid/status', false],
      ['AccountsController', 'DELETE /accounts/:uuid', false],
    ]);
  });

  it('registers no route behind an earlier route that already matches it', () => {
    expect(shadowedRoutes(routes)).toEqual([]);
  });
});
