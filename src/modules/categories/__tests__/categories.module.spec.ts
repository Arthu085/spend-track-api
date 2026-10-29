import {
  registeredRoutesOf,
  shadowedRoutes,
} from '@test/support/http/registered-routes';
import { CategoriesModule } from '../categories.module';

describe('CategoriesModule routes', () => {
  const routes = registeredRoutesOf(CategoriesModule);

  it('registers every categories route as an authenticated route', () => {
    expect(
      routes.map(({ controller, route, isPublic }) => [
        controller,
        route,
        isPublic,
      ]),
    ).toEqual([
      ['CategoriesController', 'GET /categories', false],
      ['CategoriesController', 'GET /categories/:uuid', false],
      ['CategoriesController', 'POST /categories', false],
      ['CategoriesController', 'PATCH /categories/:uuid', false],
      ['CategoriesController', 'PUT /categories/:uuid/status', false],
      ['CategoriesController', 'DELETE /categories/:uuid', false],
    ]);
  });

  it('registers no route behind an earlier route that already matches it', () => {
    expect(shadowedRoutes(routes)).toEqual([]);
  });
});
