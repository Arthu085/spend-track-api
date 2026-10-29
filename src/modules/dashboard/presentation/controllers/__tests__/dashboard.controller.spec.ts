import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SpendingPerspective } from '@modules/preferences';
import type { Translate } from '@shared/presentation/decorators';
import type { AuthenticatedUser } from '@shared/presentation/http';
import { TransactionType } from '@modules/transactions';
import { buildAccount } from '@test/support/builders/account.builder';
import { buildTransactionCategory } from '@test/support/builders/transaction-category.builder';
import { buildTransaction } from '@test/support/builders/transaction.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import type { GetDashboardUseCase } from '../../../application/use-cases/get-dashboard.use-case';
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
      balances: { actual: -5, projected: 100000 },
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
    expect(result.balances).toEqual({ actual: '-0.05', projected: '1000.00' });
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
