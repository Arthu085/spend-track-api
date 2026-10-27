import {
  registeredRoutesOf,
  shadowedRoutes,
} from '@test/support/http/registered-routes';
import { UsersModule } from '../users.module';

describe('UsersModule routes', () => {
  const routes = registeredRoutesOf(UsersModule);

  it('registers every users route on its controller with its original access level', () => {
    expect(
      routes.map(({ controller, route, isPublic }) => [
        controller,
        route,
        isPublic,
      ]),
    ).toEqual([
      ['UserEmailConfirmationController', 'POST /users/confirm-email', true],
      [
        'UserEmailConfirmationController',
        'POST /users/resend-confirmation',
        true,
      ],
      ['UsersProfileController', 'GET /users/me', false],
      ['UsersProfileController', 'GET /users/me/abilities', false],
      ['UsersProfileController', 'PATCH /users/me', false],
      ['UsersProfileController', 'PATCH /users/me/password', false],
      ['UserChangeRequestsController', 'GET /users/me/change-requests', false],
      [
        'UserChangeRequestsController',
        'POST /users/:uuid/change-requests',
        false,
      ],
      [
        'UserChangeRequestsController',
        'POST /users/me/change-requests/:uuid/approve',
        false,
      ],
      [
        'UserChangeRequestsController',
        'POST /users/me/change-requests/:uuid/reject',
        false,
      ],
      ['UsersManagementController', 'GET /users', false],
      ['UsersManagementController', 'GET /users/:uuid', false],
      ['UsersManagementController', 'POST /users', false],
      ['UsersManagementController', 'PATCH /users/:uuid', false],
      ['UsersManagementController', 'PUT /users/:uuid/status', false],
      ['UsersManagementController', 'DELETE /users/:uuid', false],
    ]);
  });

  // UsersProfileController must stay registered before
  // UsersManagementController, or GET/PATCH /users/:uuid would capture /me.
  it('registers no route behind an earlier route that already matches it', () => {
    expect(shadowedRoutes(routes)).toEqual([]);
  });
});
