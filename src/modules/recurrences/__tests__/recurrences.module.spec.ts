import {
  registeredRoutesOf,
  shadowedRoutes,
} from '@test/support/http/registered-routes';
import { RecurrencesModule } from '../recurrences.module';

describe('RecurrencesModule routes', () => {
  const routes = registeredRoutesOf(RecurrencesModule);

  it('registers every recurrence route as an authenticated route', () => {
    expect(
      routes.map(({ controller, route, isPublic }) => [
        controller,
        route,
        isPublic,
      ]),
    ).toEqual([
      [
        'RecurrenceSavingPlansController',
        'GET /recurrences/saving-plans',
        false,
      ],
      [
        'RecurrenceSavingPlansController',
        'POST /recurrences/:uuid/additional-contributions',
        false,
      ],
      ['RecurrencesController', 'GET /recurrences', false],
      ['RecurrencesController', 'GET /recurrences/:uuid', false],
      ['RecurrencesController', 'POST /recurrences', false],
      ['RecurrencesController', 'PATCH /recurrences/:uuid', false],
      ['RecurrencesController', 'PUT /recurrences/:uuid/state', false],
      ['RecurrencesController', 'PUT /recurrences/:uuid/end', false],
      [
        'RecurrenceOccurrencesController',
        'GET /recurrences/:uuid/occurrences',
        false,
      ],
      [
        'RecurrenceOccurrencesController',
        'PATCH /recurrences/:uuid/occurrences/:occurrenceUuid',
        false,
      ],
      [
        'RecurrenceOccurrencesController',
        'PUT /recurrences/:uuid/occurrences/:occurrenceUuid/confirmation',
        false,
      ],
      [
        'RecurrenceOccurrencesController',
        'PUT /recurrences/:uuid/occurrences/:occurrenceUuid/cancellation',
        false,
      ],
    ]);
  });

  it('registers no route behind an earlier route that already matches it', () => {
    expect(shadowedRoutes(routes)).toEqual([]);
  });
});
