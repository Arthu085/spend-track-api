import {
  InactiveTransactionCategoryError,
  TransactionCategoryKind,
  TransactionCategoryNotFoundError,
  type TransactionCategoryRepository,
} from '@modules/transaction-categories';
import type { TransactionManagerPort } from '@shared/application/ports';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { buildTransactionCategory } from '@test/support/builders/transaction-category.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import { BudgetCategoryNotExpenseError } from '../../../domain/errors/budget-category-not-expense.error';
import { BudgetNotFoundError } from '../../../domain/errors/budget-not-found.error';
import { EmptyBudgetError } from '../../../domain/errors/empty-budget.error';
import type {
  BudgetRepository,
  StoredBudget,
} from '../../../domain/repositories/budget.repository';
import { DeleteBudgetUseCase } from '../delete-budget.use-case';
import { GetBudgetUseCase } from '../get-budget.use-case';
import { SaveBudgetUseCase } from '../save-budget.use-case';

const transactionManager: TransactionManagerPort = {
  runInTransaction: <T>(work: () => Promise<T>): Promise<T> => work(),
  runInSavepoint: <T>(work: () => Promise<T>): Promise<T> => work(),
};

const groceries = buildTransactionCategory({ id: 5, uuid: 'groceries' });

const stored: StoredBudget = {
  month: '2026-11-01',
  totalLimit: 300000,
  categoryLimits: [{ category: groceries, limit: 80000 }],
  updatedAt: new Date('2026-11-02T10:00:00Z'),
};

describe('GetBudgetUseCase', () => {
  it("returns the caller's budget of the month", async () => {
    const findByMonth = jest.fn().mockResolvedValue(stored);

    const useCase = new GetBudgetUseCase(
      mockOf<BudgetRepository>({ findByMonth }),
    );

    await expect(
      useCase.execute({ ownerId: 4, year: 2026, month: 11 }),
    ).resolves.toEqual({
      period: { year: 2026, month: 11 },
      totalLimit: 300000,
      categoryLimits: stored.categoryLimits,
      updatedAt: stored.updatedAt,
    });
    expect(findByMonth).toHaveBeenCalledWith(4, '2026-11-01');
  });

  it('returns an empty budget for a month without one', async () => {
    const useCase = new GetBudgetUseCase(
      mockOf<BudgetRepository>({
        findByMonth: jest.fn().mockResolvedValue(null),
      }),
    );

    await expect(
      useCase.execute({ ownerId: 4, year: 2027, month: 1 }),
    ).resolves.toEqual({
      period: { year: 2027, month: 1 },
      totalLimit: null,
      categoryLimits: [],
      updatedAt: null,
    });
  });
});

describe('SaveBudgetUseCase', () => {
  function build(
    current: StoredBudget | null,
    visible: Record<string, ReturnType<typeof buildTransactionCategory>> = {},
  ) {
    const save = jest
      .fn()
      .mockImplementation((_: number, month: string, values: object) =>
        Promise.resolve({ month, ...values, updatedAt: new Date() }),
      );

    const findVisibleByUuid = jest
      .fn()
      .mockImplementation((uuid: string) =>
        Promise.resolve(visible[uuid] ?? null),
      );

    const useCase = new SaveBudgetUseCase(
      mockOf<BudgetRepository>({
        findByMonth: jest.fn().mockResolvedValue(current),
        save,
      }),
      mockOf<TransactionCategoryRepository>({ findVisibleByUuid }),
      transactionManager,
    );

    return { useCase, save, findVisibleByUuid };
  }

  it('replaces the month with the overall and category limits', async () => {
    const travel = buildTransactionCategory({ id: 9, uuid: 'travel' });
    const { useCase, save, findVisibleByUuid } = build(null, { travel });

    const budget = await useCase.execute({
      ownerId: 4,
      year: 2026,
      month: 12,
      totalLimit: 250000,
      categoryLimits: [{ categoryUuid: 'travel', limit: 50000 }],
    });

    expect(findVisibleByUuid).toHaveBeenCalledWith('travel', 4);
    expect(save).toHaveBeenCalledWith(4, '2026-12-01', {
      totalLimit: 250000,
      categoryLimits: [{ category: travel, limit: 50000 }],
    });
    expect(budget.period).toEqual({ year: 2026, month: 12 });
  });

  it('accepts category limits without an overall limit', async () => {
    const { useCase, save } = build(null, { groceries });

    await useCase.execute({
      ownerId: 4,
      year: 2026,
      month: 12,
      totalLimit: null,
      categoryLimits: [{ categoryUuid: 'groceries', limit: 100 }],
    });

    expect(save).toHaveBeenCalledWith(4, '2026-12-01', {
      totalLimit: null,
      categoryLimits: [{ category: groceries, limit: 100 }],
    });
  });

  it('rejects a budget without any limit', async () => {
    const { useCase, save } = build(null);

    await expect(
      useCase.execute({
        ownerId: 4,
        year: 2026,
        month: 12,
        totalLimit: null,
        categoryLimits: [],
      }),
    ).rejects.toBeInstanceOf(EmptyBudgetError);
    expect(save).not.toHaveBeenCalled();
  });

  it("answers not found for a category the caller cannot see, such as another user's", async () => {
    const { useCase } = build(null);

    await expect(
      useCase.execute({
        ownerId: 4,
        year: 2026,
        month: 12,
        totalLimit: 1000,
        categoryLimits: [{ categoryUuid: 'foreign', limit: 100 }],
      }),
    ).rejects.toBeInstanceOf(TransactionCategoryNotFoundError);
  });

  it('rejects an income category', async () => {
    const salary = buildTransactionCategory({
      uuid: 'salary',
      kind: TransactionCategoryKind.INCOME,
    });

    const { useCase } = build(null, { salary });

    await expect(
      useCase.execute({
        ownerId: 4,
        year: 2026,
        month: 12,
        totalLimit: 1000,
        categoryLimits: [{ categoryUuid: 'salary', limit: 100 }],
      }),
    ).rejects.toBeInstanceOf(BudgetCategoryNotExpenseError);
  });

  it('rejects a newly added inactive category', async () => {
    const archived = buildTransactionCategory({
      uuid: 'archived',
      status: RecordStatus.INACTIVE,
    });

    const { useCase } = build(null, { archived });

    await expect(
      useCase.execute({
        ownerId: 4,
        year: 2026,
        month: 12,
        totalLimit: 1000,
        categoryLimits: [{ categoryUuid: 'archived', limit: 100 }],
      }),
    ).rejects.toBeInstanceOf(InactiveTransactionCategoryError);
  });

  it('keeps a category already in the month even after it was archived', async () => {
    const archived = buildTransactionCategory({
      id: 5,
      uuid: 'groceries',
      status: RecordStatus.INACTIVE,
    });

    const { useCase, save, findVisibleByUuid } = build({
      ...stored,
      categoryLimits: [{ category: archived, limit: 80000 }],
    });

    await useCase.execute({
      ownerId: 4,
      year: 2026,
      month: 11,
      totalLimit: 300000,
      categoryLimits: [{ categoryUuid: 'groceries', limit: 90000 }],
    });

    expect(findVisibleByUuid).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledWith(4, '2026-11-01', {
      totalLimit: 300000,
      categoryLimits: [{ category: archived, limit: 90000 }],
    });
  });
});

describe('DeleteBudgetUseCase', () => {
  it("deletes the caller's budget of the month", async () => {
    const remove = jest.fn().mockResolvedValue(true);

    const useCase = new DeleteBudgetUseCase(
      mockOf<BudgetRepository>({ delete: remove }),
    );

    await useCase.execute({ ownerId: 4, year: 2026, month: 2 });

    expect(remove).toHaveBeenCalledWith(4, '2026-02-01');
  });

  it('answers not found when the month has no budget', async () => {
    const useCase = new DeleteBudgetUseCase(
      mockOf<BudgetRepository>({ delete: jest.fn().mockResolvedValue(false) }),
    );

    await expect(
      useCase.execute({ ownerId: 4, year: 2026, month: 2 }),
    ).rejects.toBeInstanceOf(BudgetNotFoundError);
  });
});
