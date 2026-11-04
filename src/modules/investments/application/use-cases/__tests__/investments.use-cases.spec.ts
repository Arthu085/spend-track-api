import {
  AccountNotFoundError,
  InactiveAccountError,
  type AccountRepository,
} from '@modules/accounts';
import { TransactionState } from '@modules/transactions';
import type { TransactionManagerPort } from '@shared/application/ports';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { PendingOperationsDecision } from '@shared/domain/pending-operations';
import { buildAccount } from '@test/support/builders/account.builder';
import {
  buildInvestment,
  buildInvestmentMovement,
} from '@test/support/builders/investment.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import type { InvestmentMovementEntity } from '../../../domain/entities/investment-movement.entity';
import type { InvestmentEntity } from '../../../domain/entities/investment.entity';
import { InvestmentMovementType } from '../../../domain/enums/investment-movement-type.enum';
import { InvestmentType } from '../../../domain/enums/investment-type.enum';
import { InactiveInvestmentError } from '../../../domain/errors/inactive-investment.error';
import { InvestmentHasHistoryError } from '../../../domain/errors/investment-has-history.error';
import { InvestmentInsufficientValueError } from '../../../domain/errors/investment-insufficient-value.error';
import { InvestmentMovementNotFoundError } from '../../../domain/errors/investment-movement-not-found.error';
import { InvestmentMovementStateTransitionError } from '../../../domain/errors/investment-movement-state-transition.error';
import { InvestmentNotFoundError } from '../../../domain/errors/investment-not-found.error';
import { InvestmentPendingOperationsDecisionRequiredError } from '../../../domain/errors/investment-pending-operations-decision-required.error';
import { InvestmentValuationUnchangedError } from '../../../domain/errors/investment-valuation-unchanged.error';
import type { InvestmentMovementRepository } from '../../../domain/repositories/investment-movement.repository';
import type { InvestmentRepository } from '../../../domain/repositories/investment.repository';
import { InvestmentValues } from '../../services/investment-values';
import { CreateInvestmentMovementUseCase } from '../create-investment-movement.use-case';
import { CreateInvestmentValuationUseCase } from '../create-investment-valuation.use-case';
import { CreateInvestmentUseCase } from '../create-investment.use-case';
import { DeleteInvestmentUseCase } from '../delete-investment.use-case';
import { GetInvestmentPendingOperationsUseCase } from '../get-investment-pending-operations.use-case';
import { GetInvestmentUseCase } from '../get-investment.use-case';
import { ListInvestmentMovementsUseCase } from '../list-investment-movements.use-case';
import { ListInvestmentsUseCase } from '../list-investments.use-case';
import { UpdateInvestmentMovementStateUseCase } from '../update-investment-movement-state.use-case';
import { UpdateInvestmentStatusUseCase } from '../update-investment-status.use-case';
import { UpdateInvestmentUseCase } from '../update-investment.use-case';

const transactionManager: TransactionManagerPort = {
  runInTransaction: <T>(work: () => Promise<T>): Promise<T> => work(),
  runInSavepoint: <T>(work: () => Promise<T>): Promise<T> => work(),
};

interface SetupOptions {
  investment?: InvestmentEntity | null;
  account?: ReturnType<typeof buildAccount> | null;
  movement?: InvestmentMovementEntity | null;
  current?: number;
  hasMovements?: boolean;
}

function setup(options: SetupOptions = {}) {
  const calls: string[] = [];

  const found =
    options.investment === undefined
      ? buildInvestment({ id: 5, ownerId: 9 })
      : options.investment;

  const investments = {
    findAllPaginatedByOwner: jest
      .fn()
      .mockResolvedValue({ items: [buildInvestment()], total: 4 }),
    findAllByOwner: jest.fn(),
    findByUuidForOwner: jest.fn().mockResolvedValue(found),
    lockOwnerInvestments: jest.fn(() => {
      calls.push('lock-investments');
      return Promise.resolve();
    }),
    create: jest.fn((investment: InvestmentEntity) =>
      Promise.resolve(investment),
    ),
    update: jest.fn((investment: InvestmentEntity) =>
      Promise.resolve(investment),
    ),
    softDelete: jest.fn().mockResolvedValue(undefined),
  };

  const movements = {
    findPaginatedByInvestment: jest
      .fn()
      .mockResolvedValue({ items: [buildInvestmentMovement()], total: 1 }),
    findPlannedByInvestment: jest.fn().mockResolvedValue([]),
    findByUuidForInvestment: jest
      .fn()
      .mockResolvedValue(
        options.movement === undefined
          ? buildInvestmentMovement()
          : options.movement,
      ),
    sumTotalsByInvestment: jest.fn(() =>
      Promise.resolve(
        new Map([
          [
            found?.id ?? 0,
            { contributed: options.current ?? 0, withdrawn: 0, adjusted: 0 },
          ],
        ]),
      ),
    ),
    sumAccountChanges: jest.fn(),
    sumByTypeAndState: jest.fn(),
    existsForAccount: jest.fn(),
    existsForInvestment: jest
      .fn()
      .mockResolvedValue(options.hasMovements ?? false),
    create: jest.fn((movement: InvestmentMovementEntity) =>
      Promise.resolve(movement),
    ),
    update: jest.fn((movement: InvestmentMovementEntity) =>
      Promise.resolve(movement),
    ),
  };

  const accounts = {
    findByUuidForOwner: jest
      .fn()
      .mockResolvedValue(
        options.account === undefined
          ? buildAccount({ id: 3, ownerId: 9 })
          : options.account,
      ),
    lockOwnerAccounts: jest.fn(() => {
      calls.push('lock-accounts');
      return Promise.resolve();
    }),
  };

  const investmentRepository = mockOf<InvestmentRepository>(investments);
  const movementRepository = mockOf<InvestmentMovementRepository>(movements);
  const accountRepository = mockOf<AccountRepository>(accounts);
  const values = new InvestmentValues(movementRepository);

  return {
    calls,
    investments,
    movements,
    accounts,
    values,
    investmentRepository,
    movementRepository,
    accountRepository,
  };
}

describe('Investment use-cases', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-03T15:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('ListInvestmentsUseCase', () => {
    it('lists active investments by default with their values', async () => {
      const ctx = setup();

      const result = await new ListInvestmentsUseCase(
        ctx.investmentRepository,
        ctx.values,
      ).execute({ ownerId: 9, page: 2, limit: 10, name: '  ' });

      expect(ctx.investments.findAllPaginatedByOwner).toHaveBeenCalledWith(
        9,
        10,
        10,
        { name: undefined, type: undefined, status: RecordStatus.ACTIVE },
      );
      expect(result.total).toBe(4);
      expect(result.items[0].value.current).toBe(0);
    });
  });

  describe('GetInvestmentUseCase', () => {
    it('answers not found for a missing or foreign investment', async () => {
      const ctx = setup({ investment: null });

      await expect(
        new GetInvestmentUseCase(ctx.investmentRepository, ctx.values).execute(
          'x',
          9,
        ),
      ).rejects.toThrow(InvestmentNotFoundError);
      expect(ctx.investments.findByUuidForOwner).toHaveBeenCalledWith('x', 9);
    });

    it('rejects an archived investment', async () => {
      const ctx = setup({
        investment: buildInvestment({ status: RecordStatus.INACTIVE }),
      });

      await expect(
        new GetInvestmentUseCase(ctx.investmentRepository, ctx.values).execute(
          'x',
          9,
        ),
      ).rejects.toThrow(InactiveInvestmentError);
    });

    it('returns the investment with its current value', async () => {
      const ctx = setup({ current: 12345 });

      const result = await new GetInvestmentUseCase(
        ctx.investmentRepository,
        ctx.values,
      ).execute('x', 9);

      expect(result.value.current).toBe(12345);
    });
  });

  describe('CreateInvestmentUseCase', () => {
    it('creates an active investment for the caller with a zero value', async () => {
      const ctx = setup();

      const result = await new CreateInvestmentUseCase(
        ctx.investmentRepository,
        ctx.values,
      ).execute({
        ownerId: 9,
        name: 'Trip',
        type: InvestmentType.GOAL,
        targetAmount: 500000,
      });

      expect(result.investment).toMatchObject({
        ownerId: 9,
        name: 'Trip',
        type: InvestmentType.GOAL,
        targetAmount: 500000,
        status: RecordStatus.ACTIVE,
      });
    });
  });

  describe('UpdateInvestmentUseCase', () => {
    function update(ctx: ReturnType<typeof setup>) {
      return new UpdateInvestmentUseCase(
        ctx.investmentRepository,
        transactionManager,
        ctx.values,
      );
    }

    it('keeps unsent fields and clears the target with null', async () => {
      const ctx = setup({
        investment: buildInvestment({ name: 'Old', targetAmount: 1000 }),
      });

      const result = await update(ctx).execute({
        uuid: 'x',
        ownerId: 9,
        name: 'New',
        targetAmount: null,
      });

      expect(ctx.calls).toEqual(['lock-investments']);
      expect(result.investment).toMatchObject({
        name: 'New',
        type: InvestmentType.RESERVE,
        targetAmount: null,
      });
    });

    it('keeps the target when it is not sent', async () => {
      const ctx = setup({
        investment: buildInvestment({ targetAmount: 1000 }),
      });

      const result = await update(ctx).execute({ uuid: 'x', ownerId: 9 });

      expect(result.investment.targetAmount).toBe(1000);
    });

    it('rejects an archived investment', async () => {
      const ctx = setup({
        investment: buildInvestment({ status: RecordStatus.INACTIVE }),
      });

      await expect(
        update(ctx).execute({ uuid: 'x', ownerId: 9, name: 'New' }),
      ).rejects.toThrow(InactiveInvestmentError);
      expect(ctx.investments.update).not.toHaveBeenCalled();
    });
  });

  describe('UpdateInvestmentStatusUseCase', () => {
    const plannedMovements = () => [
      buildInvestmentMovement({
        state: TransactionState.PLANNED,
        completedOn: null,
        amount: 1000,
      }),
      buildInvestmentMovement({
        type: InvestmentMovementType.WITHDRAWAL,
        state: TransactionState.PLANNED,
        completedOn: null,
        amount: 500,
      }),
    ];

    function updateStatus(
      ctx: ReturnType<typeof setup>,
      status: RecordStatus = RecordStatus.INACTIVE,
      pendingOperations?: PendingOperationsDecision,
    ) {
      return new UpdateInvestmentStatusUseCase(
        ctx.investmentRepository,
        transactionManager,
        ctx.values,
        ctx.movementRepository,
      ).execute({ uuid: 'x', ownerId: 9, status, pendingOperations });
    }

    it('archives and reactivates an investment', async () => {
      const ctx = setup();

      const result = await updateStatus(ctx);

      expect(ctx.calls).toEqual(['lock-investments']);
      expect(result.investment.status).toBe(RecordStatus.INACTIVE);
    });

    it('asks for a decision and changes nothing without one', async () => {
      const ctx = setup();

      ctx.movements.findPlannedByInvestment.mockResolvedValue(
        plannedMovements(),
      );

      await expect(updateStatus(ctx)).rejects.toThrow(
        InvestmentPendingOperationsDecisionRequiredError,
      );
      expect(ctx.investments.update).not.toHaveBeenCalled();
      expect(ctx.movements.update).not.toHaveBeenCalled();
    });

    it('keeps planned movements when asked, without touching them', async () => {
      const ctx = setup();

      ctx.movements.findPlannedByInvestment.mockResolvedValue(
        plannedMovements(),
      );

      const result = await updateStatus(
        ctx,
        RecordStatus.INACTIVE,
        PendingOperationsDecision.KEEP,
      );

      expect(result.investment.status).toBe(RecordStatus.INACTIVE);
      expect(ctx.movements.update).not.toHaveBeenCalled();
    });

    it('cancels planned movements when asked and leaves the others alone', async () => {
      const ctx = setup();

      ctx.movements.findPlannedByInvestment.mockResolvedValue(
        plannedMovements(),
      );

      const result = await updateStatus(
        ctx,
        RecordStatus.INACTIVE,
        PendingOperationsDecision.CANCEL,
      );

      expect(ctx.movements.findPlannedByInvestment).toHaveBeenCalledWith(9, 5);
      expect(result.investment.status).toBe(RecordStatus.INACTIVE);
      expect(ctx.movements.update).toHaveBeenCalledTimes(2);
      expect(ctx.movements.update).toHaveBeenCalledWith(
        expect.objectContaining({
          state: TransactionState.CANCELED,
          canceledAt: expect.any(Date) as Date,
        }),
      );
    });

    it('needs no decision and cancels nothing when the status does not move to archived', async () => {
      const ctx = setup({
        investment: buildInvestment({ status: RecordStatus.INACTIVE }),
      });

      ctx.movements.findPlannedByInvestment.mockResolvedValue(
        plannedMovements(),
      );

      await updateStatus(ctx);
      await updateStatus(
        ctx,
        RecordStatus.ACTIVE,
        PendingOperationsDecision.CANCEL,
      );

      expect(ctx.movements.findPlannedByInvestment).not.toHaveBeenCalled();
      expect(ctx.movements.update).not.toHaveBeenCalled();
    });
  });

  describe('GetInvestmentPendingOperationsUseCase', () => {
    function pendingOperations(ctx: ReturnType<typeof setup>) {
      return new GetInvestmentPendingOperationsUseCase(
        ctx.investmentRepository,
        ctx.movementRepository,
      );
    }

    it('summarizes the planned movements of an owned investment, archived or not', async () => {
      const ctx = setup({
        investment: buildInvestment({ id: 5, status: RecordStatus.INACTIVE }),
      });

      ctx.movements.findPlannedByInvestment.mockResolvedValue([
        buildInvestmentMovement({ amount: 1000 }),
        buildInvestmentMovement({ amount: 500 }),
      ]);

      await expect(pendingOperations(ctx).execute('x', 9)).resolves.toEqual({
        count: 2,
        total: 1500,
      });
      expect(ctx.movements.findPlannedByInvestment).toHaveBeenCalledWith(9, 5);
    });

    it('answers not found for a foreign investment', async () => {
      await expect(
        pendingOperations(setup({ investment: null })).execute('x', 9),
      ).rejects.toThrow(InvestmentNotFoundError);
    });
  });

  describe('DeleteInvestmentUseCase', () => {
    function remove(ctx: ReturnType<typeof setup>) {
      return new DeleteInvestmentUseCase(
        ctx.investmentRepository,
        ctx.movementRepository,
        transactionManager,
      );
    }

    it('soft-deletes an investment without movements', async () => {
      const ctx = setup();

      await remove(ctx).execute({ uuid: 'x', ownerId: 9 });

      expect(ctx.movements.existsForInvestment).toHaveBeenCalledWith(9, 5);
      expect(ctx.investments.softDelete).toHaveBeenCalled();
    });

    it('keeps an investment with movements', async () => {
      const ctx = setup({ hasMovements: true });

      await expect(
        remove(ctx).execute({ uuid: 'x', ownerId: 9 }),
      ).rejects.toThrow(InvestmentHasHistoryError);
      expect(ctx.investments.softDelete).not.toHaveBeenCalled();
    });
  });

  describe('ListInvestmentMovementsUseCase', () => {
    it('lists the movements of an owned investment, archived ones included', async () => {
      const ctx = setup({
        investment: buildInvestment({ id: 5, status: RecordStatus.INACTIVE }),
      });

      const result = await new ListInvestmentMovementsUseCase(
        ctx.investmentRepository,
        ctx.movementRepository,
      ).execute({ investmentUuid: 'x', ownerId: 9, page: 1, limit: 20 });

      expect(ctx.movements.findPaginatedByInvestment).toHaveBeenCalledWith(
        9,
        5,
        0,
        20,
      );
      expect(result.total).toBe(1);
    });
  });

  describe('CreateInvestmentMovementUseCase', () => {
    function create(ctx: ReturnType<typeof setup>) {
      return new CreateInvestmentMovementUseCase(
        ctx.investmentRepository,
        ctx.movementRepository,
        ctx.accountRepository,
        transactionManager,
        ctx.values,
      );
    }

    const input = {
      investmentUuid: 'x',
      ownerId: 9,
      accountUuid: 'acc',
      amount: 5000,
      date: '2026-11-05',
    };

    it('records a completed contribution from an active account under both locks', async () => {
      const ctx = setup();

      const movement = await create(ctx).execute({
        ...input,
        type: InvestmentMovementType.CONTRIBUTION,
        state: TransactionState.COMPLETED,
      });

      expect(ctx.calls).toEqual(['lock-accounts', 'lock-investments']);
      expect(ctx.accounts.findByUuidForOwner).toHaveBeenCalledWith('acc', 9);
      expect(movement).toMatchObject({
        investmentId: 5,
        ownerId: 9,
        type: InvestmentMovementType.CONTRIBUTION,
        state: TransactionState.COMPLETED,
        completedOn: '2026-11-05',
        valueChange: 5000,
      });
    });

    it('rejects a completed withdrawal above the current value', async () => {
      const ctx = setup({ current: 4999 });

      await expect(
        create(ctx).execute({
          ...input,
          type: InvestmentMovementType.WITHDRAWAL,
          state: TransactionState.COMPLETED,
        }),
      ).rejects.toThrow(InvestmentInsufficientValueError);
      expect(ctx.movements.create).not.toHaveBeenCalled();
    });

    it('accepts a planned withdrawal whatever the current value', async () => {
      const ctx = setup({ current: 0 });

      const movement = await create(ctx).execute({
        ...input,
        type: InvestmentMovementType.WITHDRAWAL,
        state: TransactionState.PLANNED,
      });

      expect(movement.state).toBe(TransactionState.PLANNED);
    });

    it('rejects an archived investment, a foreign account, and an inactive account', async () => {
      const contribution = {
        ...input,
        type: InvestmentMovementType.CONTRIBUTION,
        state: TransactionState.COMPLETED,
      } as const;

      await expect(
        create(
          setup({
            investment: buildInvestment({ status: RecordStatus.INACTIVE }),
          }),
        ).execute(contribution),
      ).rejects.toThrow(InactiveInvestmentError);
      await expect(
        create(setup({ account: null })).execute(contribution),
      ).rejects.toThrow(AccountNotFoundError);
      await expect(
        create(
          setup({ account: buildAccount({ status: RecordStatus.INACTIVE }) }),
        ).execute(contribution),
      ).rejects.toThrow(InactiveAccountError);
    });
  });

  describe('CreateInvestmentValuationUseCase', () => {
    function valuate(ctx: ReturnType<typeof setup>) {
      return new CreateInvestmentValuationUseCase(
        ctx.investmentRepository,
        ctx.movementRepository,
        transactionManager,
        ctx.values,
      );
    }

    it('records the difference from the current value, dated today by default', async () => {
      const ctx = setup({ current: 100000 });

      const movement = await valuate(ctx).execute({
        investmentUuid: 'x',
        ownerId: 9,
        value: 98750,
      });

      expect(ctx.calls).toEqual(['lock-investments']);
      expect(movement).toMatchObject({
        type: InvestmentMovementType.VALUATION,
        amount: -1250,
        account: null,
        date: '2026-11-03',
      });
    });

    it('rejects a value equal to the current one', async () => {
      const ctx = setup({ current: 100000 });

      await expect(
        valuate(ctx).execute({
          investmentUuid: 'x',
          ownerId: 9,
          value: 100000,
          date: '2026-11-01',
        }),
      ).rejects.toThrow(InvestmentValuationUnchangedError);
    });
  });

  describe('UpdateInvestmentMovementStateUseCase', () => {
    function changeState(ctx: ReturnType<typeof setup>) {
      return new UpdateInvestmentMovementStateUseCase(
        ctx.investmentRepository,
        ctx.movementRepository,
        ctx.accountRepository,
        transactionManager,
        ctx.values,
      );
    }

    const input = { investmentUuid: 'x', movementUuid: 'm', ownerId: 9 };

    it('confirms a planned contribution on today by default', async () => {
      const ctx = setup({
        movement: buildInvestmentMovement({
          state: TransactionState.PLANNED,
          completedOn: null,
        }),
      });

      const movement = await changeState(ctx).execute({
        ...input,
        state: TransactionState.COMPLETED,
      });

      expect(ctx.calls).toEqual(['lock-accounts', 'lock-investments']);
      expect(ctx.movements.findByUuidForInvestment).toHaveBeenCalledWith(
        'm',
        5,
      );
      expect(movement).toMatchObject({
        state: TransactionState.COMPLETED,
        completedOn: '2026-11-03',
      });
    });

    it('answers not found for a movement of another investment', async () => {
      const ctx = setup({ movement: null });

      await expect(
        changeState(ctx).execute({
          ...input,
          state: TransactionState.CANCELED,
        }),
      ).rejects.toThrow(InvestmentMovementNotFoundError);
    });

    it('confirms a planned movement kept on an archived investment', async () => {
      const ctx = setup({
        investment: buildInvestment({ id: 5, status: RecordStatus.INACTIVE }),
        movement: buildInvestmentMovement({
          state: TransactionState.PLANNED,
          completedOn: null,
        }),
      });

      const movement = await changeState(ctx).execute({
        ...input,
        state: TransactionState.COMPLETED,
      });

      expect(movement.state).toBe(TransactionState.COMPLETED);
    });

    it('rejects confirming twice, or on an inactive account', async () => {
      await expect(
        changeState(setup()).execute({
          ...input,
          state: TransactionState.COMPLETED,
        }),
      ).rejects.toThrow(InvestmentMovementStateTransitionError);

      await expect(
        changeState(
          setup({
            movement: buildInvestmentMovement({
              state: TransactionState.PLANNED,
              completedOn: null,
              account: buildAccount({ status: RecordStatus.INACTIVE }),
            }),
          }),
        ).execute({ ...input, state: TransactionState.COMPLETED }),
      ).rejects.toThrow(InactiveAccountError);
    });

    it('rejects confirming a withdrawal above the current value', async () => {
      const ctx = setup({
        current: 100,
        movement: buildInvestmentMovement({
          type: InvestmentMovementType.WITHDRAWAL,
          state: TransactionState.PLANNED,
          completedOn: null,
          amount: 101,
        }),
      });

      await expect(
        changeState(ctx).execute({
          ...input,
          state: TransactionState.COMPLETED,
        }),
      ).rejects.toThrow(InvestmentInsufficientValueError);
    });

    it('cancels a completed contribution while the value stays covered, even when archived', async () => {
      const ctx = setup({
        current: 10000,
        investment: buildInvestment({ id: 5, status: RecordStatus.INACTIVE }),
      });

      const movement = await changeState(ctx).execute({
        ...input,
        state: TransactionState.CANCELED,
      });

      expect(movement.state).toBe(TransactionState.CANCELED);
    });

    it('refuses to cancel a contribution that was already withdrawn', async () => {
      const ctx = setup({ current: 9999 });

      await expect(
        changeState(ctx).execute({
          ...input,
          state: TransactionState.CANCELED,
        }),
      ).rejects.toThrow(InvestmentInsufficientValueError);
      expect(ctx.movements.update).not.toHaveBeenCalled();
    });

    it('cancels a completed withdrawal, which raises the value', async () => {
      const ctx = setup({
        current: 0,
        movement: buildInvestmentMovement({
          type: InvestmentMovementType.WITHDRAWAL,
        }),
      });

      const movement = await changeState(ctx).execute({
        ...input,
        state: TransactionState.CANCELED,
      });

      expect(movement.state).toBe(TransactionState.CANCELED);
    });
  });
});
