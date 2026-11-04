import {
  registeredRoutesOf,
  shadowedRoutes,
} from '@test/support/http/registered-routes';
import { CreditCardsModule } from '../credit-cards.module';

describe('CreditCardsModule routes', () => {
  const routes = registeredRoutesOf(CreditCardsModule);

  it('registers every credit card route as an authenticated route', () => {
    expect(
      routes.map(({ controller, route, isPublic }) => [
        controller,
        route,
        isPublic,
      ]),
    ).toEqual([
      ['CreditCardsController', 'GET /credit-cards', false],
      ['CreditCardsController', 'GET /credit-cards/:uuid', false],
      ['CreditCardsController', 'GET /credit-cards/:uuid/invoices', false],
      [
        'CreditCardsController',
        'GET /credit-cards/:uuid/pending-operations',
        false,
      ],
      ['CreditCardsController', 'POST /credit-cards', false],
      ['CreditCardsController', 'PATCH /credit-cards/:uuid', false],
      ['CreditCardsController', 'PUT /credit-cards/:uuid/status', false],
      ['CreditCardsController', 'DELETE /credit-cards/:uuid', false],
      [
        'CreditCardInvoicesController',
        'GET /credit-card-invoices/:uuid',
        false,
      ],
      [
        'CreditCardInvoicesController',
        'POST /credit-card-invoices/:uuid/payments',
        false,
      ],
      [
        'CreditCardInvoicesController',
        'PUT /credit-card-invoices/:uuid/payments/:paymentUuid/cancellation',
        false,
      ],
      ['CreditCardPurchasesController', 'GET /credit-card-purchases', false],
      [
        'CreditCardPurchasesController',
        'GET /credit-card-purchases/:uuid',
        false,
      ],
      ['CreditCardPurchasesController', 'POST /credit-card-purchases', false],
      [
        'CreditCardPurchasesController',
        'POST /credit-card-purchases/:uuid/refunds',
        false,
      ],
      [
        'CreditCardPurchasesController',
        'PATCH /credit-card-purchases/:uuid',
        false,
      ],
      [
        'CreditCardPurchasesController',
        'DELETE /credit-card-purchases/:uuid',
        false,
      ],
      [
        'CreditCardPurchasesController',
        'DELETE /credit-card-purchases/:uuid/refunds/:refundUuid',
        false,
      ],
    ]);
  });

  it('registers no route behind an earlier route that already matches it', () => {
    expect(shadowedRoutes(routes)).toEqual([]);
  });
});
