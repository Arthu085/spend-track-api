import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Translate } from '@shared/presentation/decorators';
import type { AuthenticatedUser } from '@shared/presentation/http';
import { buildTransactionCategory } from '@test/support/builders/transaction-category.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import type { DeleteBudgetUseCase } from '../../../application/use-cases/delete-budget.use-case';
import type { GetBudgetUseCase } from '../../../application/use-cases/get-budget.use-case';
import type { SaveBudgetUseCase } from '../../../application/use-cases/save-budget.use-case';
import { BudgetMonthParamsDto } from '../../dto/input/budget-month-params.dto';
import { SaveBudgetDto } from '../../dto/input/save-budget.dto';
import { BudgetsController } from '../budgets.controller';

const translate: Translate = (key) => `t:${key}`;

const actor: AuthenticatedUser = {
  id: 17,
  uuid: 'actor-uuid',
  email: 'actor@example.com',
  name: 'Actor',
  roles: ['ADMIN'],
};

const budget = {
  period: { year: 2026, month: 11 },
  totalLimit: 300000,
  categoryLimits: [
    {
      category: buildTransactionCategory({
        ownerId: null,
        code: 'GROCERIES',
        name: 'Groceries',
      }),
      limit: 80050,
    },
  ],
  updatedAt: new Date('2026-11-02T10:00:00Z'),
};

function build() {
  const get = jest.fn().mockResolvedValue(budget);
  const save = jest.fn().mockResolvedValue(budget);
  const remove = jest.fn().mockResolvedValue(undefined);

  const controller = new BudgetsController(
    mockOf<GetBudgetUseCase>({ execute: get }),
    mockOf<SaveBudgetUseCase>({ execute: save }),
    mockOf<DeleteBudgetUseCase>({ execute: remove }),
  );

  return { controller, get, save, remove };
}

describe('BudgetsController', () => {
  it("serializes the caller's budget with decimal amounts", async () => {
    const { controller, get } = build();

    const result = await controller.findMine(
      { year: 2026, month: 11 },
      actor,
      translate,
    );

    expect(get).toHaveBeenCalledWith({ ownerId: 17, year: 2026, month: 11 });
    expect(result).toEqual({
      year: 2026,
      month: 11,
      totalLimit: '3000.00',
      categoryLimits: [
        {
          category: {
            uuid: 'category-uuid',
            name: 't:transaction_categories.global.groceries',
            kind: 'EXPENSE',
            color: '#123456',
            status: 'ACTIVE',
          },
          limit: '800.50',
        },
      ],
      updatedAt: budget.updatedAt,
    });
  });

  it('saves exact cents for the caller only', async () => {
    const { controller, save } = build();

    await controller.saveMine(
      { year: 2026, month: 11 },
      {
        totalLimit: null,
        categoryLimits: [{ categoryUuid: 'groceries', limit: '0.10' }],
      },
      actor,
      translate,
    );

    expect(save).toHaveBeenCalledWith({
      ownerId: 17,
      year: 2026,
      month: 11,
      totalLimit: null,
      categoryLimits: [{ categoryUuid: 'groceries', limit: 10 }],
    });
  });

  it("deletes the caller's budget of the month", async () => {
    const { controller, remove } = build();

    await controller.removeMine({ year: 2026, month: 11 }, actor);

    expect(remove).toHaveBeenCalledWith({
      ownerId: 17,
      year: 2026,
      month: 11,
    });
  });
});

describe('BudgetMonthParamsDto', () => {
  it('accepts a year and month from the path', async () => {
    await expect(
      validate(
        plainToInstance(BudgetMonthParamsDto, { year: '2026', month: '1' }),
      ),
    ).resolves.toHaveLength(0);
  });

  it.each([
    [{ year: '2026', month: '13' }],
    [{ year: '1999', month: '1' }],
    [{ year: 'next', month: '1' }],
  ])('rejects an invalid month: %o', async (params) => {
    await expect(
      validate(plainToInstance(BudgetMonthParamsDto, params)),
    ).resolves.toHaveLength(1);
  });
});

describe('SaveBudgetDto', () => {
  const category = '7f1c8c1e-6b2a-4c4e-9d55-2f9a4f6b8e01';

  async function errorsFor(body: Record<string, unknown>) {
    return validate(plainToInstance(SaveBudgetDto, body));
  }

  it('accepts an overall limit with category limits', async () => {
    await expect(
      errorsFor({
        totalLimit: '3000.00',
        categoryLimits: [{ categoryUuid: category, limit: '800' }],
      }),
    ).resolves.toHaveLength(0);
  });

  it('accepts a null overall limit', async () => {
    await expect(
      errorsFor({ totalLimit: null, categoryLimits: [] }),
    ).resolves.toHaveLength(0);
  });

  it('requires the overall limit to be sent, even as null', async () => {
    const errors = await errorsFor({ categoryLimits: [] });

    expect(errors.map(({ property }) => property)).toEqual(['totalLimit']);
  });

  it.each(['0', '0.00', '-1', '1.234'])(
    'rejects a limit that is not strictly positive money: %s',
    async (limit) => {
      const errors = await errorsFor({
        totalLimit: limit,
        categoryLimits: [{ categoryUuid: category, limit }],
      });

      expect(errors.map(({ property }) => property)).toEqual([
        'totalLimit',
        'categoryLimits',
      ]);
    },
  );

  it('rejects the same category twice', async () => {
    const errors = await errorsFor({
      totalLimit: null,
      categoryLimits: [
        { categoryUuid: category, limit: '1' },
        { categoryUuid: category, limit: '2' },
      ],
    });

    expect(errors[0].constraints).toHaveProperty('arrayUnique');
  });
});
