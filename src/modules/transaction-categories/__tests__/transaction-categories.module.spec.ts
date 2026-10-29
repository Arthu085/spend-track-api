import {
  registeredRoutesOf,
  shadowedRoutes,
} from '@test/support/http/registered-routes';
import { TransactionCategoriesModule } from '../transaction-categories.module';

describe('TransactionCategoriesModule routes', () => {
  const routes = registeredRoutesOf(TransactionCategoriesModule);

  it('registers every transaction categories route as an authenticated route', () => {
    expect(
      routes.map(({ controller, route, isPublic }) => [
        controller,
        route,
        isPublic,
      ]),
    ).toEqual([
      ['TransactionCategoriesController', 'GET /transaction-categories', false],
      [
        'TransactionCategoriesController',
        'GET /transaction-categories/:uuid',
        false,
      ],
      [
        'TransactionCategoriesController',
        'POST /transaction-categories',
        false,
      ],
      [
        'TransactionCategoriesController',
        'PATCH /transaction-categories/:uuid',
        false,
      ],
      [
        'TransactionCategoriesController',
        'PUT /transaction-categories/:uuid/status',
        false,
      ],
      [
        'TransactionCategoriesController',
        'DELETE /transaction-categories/:uuid',
        false,
      ],
    ]);
  });

  it('registers no route behind an earlier route that already matches it', () => {
    expect(shadowedRoutes(routes)).toEqual([]);
  });
});
