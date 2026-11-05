import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SpendingPerspective } from '@modules/preferences';
import type { Translate } from '@shared/presentation/decorators';
import type { AuthenticatedUser } from '@shared/presentation/http';
import { TransactionType } from '@modules/transactions';
import { buildAccount } from '@test/support/builders/account.builder';
import {
  buildCreditCard,
  buildInvoiceStatement,
} from '@test/support/builders/credit-card.builder';
import { buildInvestment } from '@test/support/builders/investment.builder';
import { buildTransactionCategory } from '@test/support/builders/transaction-category.builder';
import { buildTransaction } from '@test/support/builders/transaction.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import { buildRecurrenceCardCharge } from '@test/support/builders/recurrence.builder';
import type { GetDashboardUseCase } from '../../../application/use-cases/get-dashboard.use-case';
import { SpendingGuidanceBasis } from '../../../domain/budget/spending-guidance';
import {
  PeriodTiming,
  resolveMonthPeriod,
} from '../../../domain/period/month-period';
import { DashboardQueryDto } from '../../dto/input/dashboard-query.dto';
import { DashboardController } from '../dashboard.controller';

const translate: Translate = (key) => `t:${key}`;

const actor: AuthenticatedUser = {
  id: 41,
  uuid: 'actor-uuid',
  email: 'actor@example.com',
  name: 'Actor',
  roles: ['ADMIN'],
};

describe('DashboardController', () => {
  it("serializes the caller's summary with decimal amounts", async () => {
    const execute = jest.fn().mockResolvedValue({
      period: resolveMonthPeriod({ year: 2026, month: 11 }, '2026-10-29'),
      perspective: SpendingPerspective.INVOICE_MONTH,
      balances: { actual: -5, projected: 100000, available: 70000 },
      accounts: [
        {
          account: buildAccount({ isDefault: true }),
          actualBalance: -5,
          projectedBalance: 100000,
        },
      ],
      income: { total: 500000, completed: 300000, pending: 200000 },
      expenses: { total: 120000, completed: 80000, pending: 40000 },
      expensesByCategory: [
        {
          category: buildTransactionCategory({
            ownerId: null,
            code: 'GROCERIES',
            name: 'Groceries',
          }),
          total: 120000,
          completed: 80000,
          pending: 40000,
        },
      ],
      upcoming: [
        {
          transaction: buildTransaction({ amount: 150000, date: '2026-11-05' }),
          overdue: false,
        },
        {
          transaction: buildTransaction({
            uuid: 'transfer',
            type: TransactionType.TRANSFER,
            category: null,
            destinationAccount: buildAccount({ uuid: 'savings' }),
          }),
          overdue: true,
        },
      ],
      upcomingCount: 7,
      creditCards: {
        spending: 30000,
        planned: 5590,
        plannedDue: 5590,
        outstanding: 30000,
        invoices: [buildInvoiceStatement()],
        plannedCharges: [
          {
            charge: buildRecurrenceCardCharge({
              category: buildTransactionCategory({ name: 'Streaming' }),
            }),
            recurrenceUuid: 'recurrence-uuid',
            card: buildCreditCard({ uuid: 'card-uuid', name: 'Visa' }),
            overdue: false,
          },
        ],
        plannedChargesCount: 1,
      },
      budget: {
        overall: {
          limit: 100000,
          total: 120000,
          completed: 80000,
          pending: 40000,
          remaining: 0,
          overspent: 20000,
        },
        categories: [
          {
            category: buildTransactionCategory({ name: 'Groceries' }),
            limit: 150000,
            total: 120000,
            completed: 80000,
            pending: 40000,
            remaining: 30000,
            overspent: 0,
          },
        ],
      },
      investments: {
        totalValue: 600050,
        contributions: { total: 40000, completed: 30000, pending: 10000 },
        withdrawals: { total: 0, completed: 0, pending: 0 },
        contributionBreakdown: {
          mandatoryPlanned: 10000,
          mandatoryCompleted: 20000,
          additionalPlanned: 0,
          additionalCompleted: 5000,
          oneTimePlanned: 0,
          oneTimeCompleted: 5000,
        },
        savingPlans: [],
        items: [
          {
            investment: buildInvestment({ targetAmount: 1000000 }),
            value: {
              current: 600050,
              contributed: 600000,
              withdrawn: 0,
              adjusted: 50,
            },
          },
          {
            investment: buildInvestment({ uuid: 'no-target' }),
            value: { current: 0, contributed: 0, withdrawn: 0, adjusted: 0 },
          },
        ],
      },
      spendingGuidance: {
        basis: SpendingGuidanceBasis.BUDGET,
        remaining: 0,
        dailyAllowance: null,
      },
    });

    const controller = new DashboardController(
      mockOf<GetDashboardUseCase>({ execute }),
    );

    const result = await controller.findMine(
      { year: 2026, month: 11 },
      actor,
      translate,
    );

    expect(execute).toHaveBeenCalledWith({
      ownerId: 41,
      year: 2026,
      month: 11,
      perspective: undefined,
    });
    expect(result.period).toMatchObject({
      timing: PeriodTiming.FUTURE,
      remainingDays: 30,
    });
    expect(result.perspectiveLabel).toBe(
      't:preferences.spending_perspective.invoice_month',
    );
    expect(result.balances).toEqual({
      actual: '-0.05',
      projected: '1000.00',
      available: '700.00',
    });
    expect(result.investments).toEqual({
      totalValue: '6000.50',
      contributions: {
        total: '400.00',
        completed: '300.00',
        pending: '100.00',
      },
      withdrawals: { total: '0.00', completed: '0.00', pending: '0.00' },
      contributionBreakdown: {
        mandatoryPlanned: '100.00',
        mandatoryCompleted: '200.00',
        additionalPlanned: '0.00',
        additionalCompleted: '50.00',
        oneTimePlanned: '0.00',
        oneTimeCompleted: '50.00',
      },
      savingPlans: [],
      items: [
        {
          uuid: 'investment-uuid',
          name: 'Emergency reserve',
          type: 'RESERVE',
          typeLabel: 't:investments.type.reserve',
          currentValue: '6000.50',
          targetAmount: '10000.00',
          progress: { remaining: '3999.50', percent: 60 },
        },
        {
          uuid: 'no-target',
          name: 'Emergency reserve',
          type: 'RESERVE',
          typeLabel: 't:investments.type.reserve',
          currentValue: '0.00',
          targetAmount: null,
          progress: null,
        },
      ],
    });
    expect(result.accounts[0]).toMatchObject({
      isDefault: true,
      typeLabel: 't:accounts.type.checking',
      actualBalance: '-0.05',
      projectedBalance: '1000.00',
    });
    expect(result.income).toEqual({
      total: '5000.00',
      completed: '3000.00',
      pending: '2000.00',
    });
    expect(result.expenses).toMatchObject({ total: '1200.00' });
    expect(result.expensesByCategory).toEqual([
      expect.objectContaining({
        category: {
          uuid: 'category-uuid',
          name: 't:transaction_categories.global.groceries',
          color: '#123456',
        },
        total: '1200.00',
        completed: '800.00',
        pending: '400.00',
      }),
    ]);
    expect(result.upcoming[0]).toMatchObject({
      typeLabel: 't:transactions.type.expense',
      amount: '1500.00',
      date: '2026-11-05',
      overdue: false,
      account: { uuid: 'account-uuid', name: 'Checking', status: 'ACTIVE' },
      destinationAccount: null,
      category: { uuid: 'category-uuid', name: 'Pets', color: '#123456' },
    });
    expect(result.upcoming[1]).toMatchObject({
      overdue: true,
      category: null,
      destinationAccount: { uuid: 'savings' },
    });
    expect(result.upcomingCount).toBe(7);
    expect(result.creditCards).toEqual({
      spending: '300.00',
      planned: '55.90',
      plannedDue: '55.90',
      plannedCharges: [
        {
          uuid: 'charge-uuid',
          recurrenceUuid: 'recurrence-uuid',
          description: 'Netflix',
          amount: '55.90',
          date: '2026-11-15',
          invoiceMonth: '2026-12-01',
          overdue: false,
          card: { uuid: 'card-uuid', name: 'Visa', status: 'ACTIVE' },
          category: expect.objectContaining({ name: 'Streaming' }) as unknown,
        },
      ],
      plannedChargesCount: 1,
      outstanding: '300.00',
      invoices: [
        expect.objectContaining({
          uuid: 'invoice-uuid',
          card: { uuid: 'card-uuid', name: 'Visa', status: 'ACTIVE' },
          referenceMonth: '2026-11-01',
          total: '300.00',
          outstanding: '300.00',
          status: 'OPEN',
          statusLabel: 't:credit_cards.invoice_status.open',
        }),
      ],
    });
    expect(result.budget).toEqual({
      overall: {
        limit: '1000.00',
        total: '1200.00',
        completed: '800.00',
        pending: '400.00',
        remaining: '0.00',
        overspent: '200.00',
      },
      categories: [
        {
          category: {
            uuid: 'category-uuid',
            name: 'Groceries',
            color: '#123456',
          },
          limit: '1500.00',
          total: '1200.00',
          completed: '800.00',
          pending: '400.00',
          remaining: '300.00',
          overspent: '0.00',
        },
      ],
    });
    expect(result.spendingGuidance).toEqual({
      basis: SpendingGuidanceBasis.BUDGET,
      remaining: '0.00',
      dailyAllowance: null,
    });
  });
});

describe('DashboardQueryDto', () => {
  async function errorsFor(query: Record<string, unknown>) {
    return validate(plainToInstance(DashboardQueryDto, query));
  }

  it('accepts no month at all', async () => {
    await expect(errorsFor({})).resolves.toHaveLength(0);
  });

  it('accepts a year and month sent together as query strings', async () => {
    await expect(
      errorsFor({ year: '2026', month: '12' }),
    ).resolves.toHaveLength(0);
  });

  it.each([[{ year: '2026' }], [{ month: '3' }]])(
    'requires year and month together: %o',
    async (query) => {
      await expect(errorsFor(query)).resolves.toHaveLength(1);
    },
  );

  it('rejects a month outside 1–12', async () => {
    const errors = await errorsFor({ year: '2026', month: '13' });

    expect(errors[0].constraints).toHaveProperty('max');
  });
});
