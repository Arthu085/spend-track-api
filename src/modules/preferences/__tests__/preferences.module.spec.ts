import {
  registeredRoutesOf,
  shadowedRoutes,
} from '@test/support/http/registered-routes';
import { PreferencesModule } from '../preferences.module';

describe('PreferencesModule routes', () => {
  const routes = registeredRoutesOf(PreferencesModule);

  it('registers every preferences route as an authenticated route', () => {
    expect(
      routes.map(({ controller, route, isPublic }) => [
        controller,
        route,
        isPublic,
      ]),
    ).toEqual([
      ['PreferencesController', 'GET /preferences', false],
      ['PreferencesController', 'PATCH /preferences', false],
    ]);
  });

  it('registers no route behind an earlier route that already matches it', () => {
    expect(shadowedRoutes(routes)).toEqual([]);
  });
});
