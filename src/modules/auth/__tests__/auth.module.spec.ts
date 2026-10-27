import {
  registeredRoutesOf,
  shadowedRoutes,
} from '@test/support/http/registered-routes';
import { AuthModule } from '../auth.module';

describe('AuthModule routes', () => {
  const routes = registeredRoutesOf(AuthModule);

  it('registers every auth route on its controller with its original access level', () => {
    expect(
      routes.map(({ controller, route, isPublic }) => [
        controller,
        route,
        isPublic,
      ]),
    ).toEqual([
      ['AuthSessionsController', 'GET /auth/csrf', true],
      ['AuthSessionsController', 'POST /auth/login', true],
      ['AuthSessionsController', 'POST /auth/refresh', true],
      ['AuthSessionsController', 'POST /auth/logout', false],
      ['PasswordRecoveryController', 'POST /auth/forgot-password', true],
      ['PasswordRecoveryController', 'POST /auth/reset-password', true],
    ]);
  });

  it('registers no route behind an earlier route that already matches it', () => {
    expect(shadowedRoutes(routes)).toEqual([]);
  });
});
