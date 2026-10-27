import {
  registeredRoutesOf,
  shadowedRoutes,
} from '@test/support/http/registered-routes';
import { AuthorizationModule } from '../authorization.module';

describe('AuthorizationModule routes', () => {
  const routes = registeredRoutesOf(AuthorizationModule);

  it('registers every authorization route on its controller, none of them public', () => {
    expect(
      routes.map(({ controller, route, isPublic }) => [
        controller,
        route,
        isPublic,
      ]),
    ).toEqual([
      ['RolesController', 'GET /roles', false],
      ['RolesController', 'GET /roles/:uuid', false],
      ['RolesController', 'PATCH /roles/:uuid/abilities', false],
      ['AbilitiesController', 'GET /abilities', false],
    ]);
  });

  it('registers no route behind an earlier route that already matches it', () => {
    expect(shadowedRoutes(routes)).toEqual([]);
  });
});
