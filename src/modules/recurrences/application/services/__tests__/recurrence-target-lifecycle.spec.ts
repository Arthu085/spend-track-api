import {
  AccountDeletionGuards,
  AccountHasRecurrencesError,
} from '@modules/accounts';
import {
  InvestmentLifecycle,
  InvestmentHasRecurrencesError,
} from '@modules/investments';
import { PendingOperationsDecision } from '@shared/domain/pending-operations';
import { buildRecurrence } from '@test/support/builders/recurrence.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import type { RecurrenceEntity } from '../../../domain/entities/recurrence.entity';
import { RecurrenceState } from '../../../domain/enums/recurrence-state.enum';
import type { RecurrenceRepository } from '../../../domain/repositories/recurrence.repository';
import { RecurrenceTargetLifecycle } from '../recurrence-target-lifecycle';

function setup(rows: RecurrenceEntity[] = []) {
  const findOpenByTarget = jest.fn().mockResolvedValue(rows);

  const update = jest.fn((recurrence: RecurrenceEntity) =>
    Promise.resolve(recurrence),
  );

  const accounts = new AccountDeletionGuards();
  const investments = new InvestmentLifecycle();

  const lifecycle = new RecurrenceTargetLifecycle(
    mockOf<RecurrenceRepository>({ findOpenByTarget, update }),
    accounts,
    investments,
  );

  lifecycle.onModuleInit();

  return { accounts, investments, findOpenByTarget, update };
}

describe('RecurrenceTargetLifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-05T15:00:00Z'));
  });

  afterEach(() => jest.useRealTimers());

  it.each([RecurrenceState.ACTIVE, RecurrenceState.PAUSED])(
    'blocks account and investment deletion for %s recurrences',
    async (state) => {
      const ctx = setup([buildRecurrence({ state })]);

      await expect(ctx.accounts.assertCanDelete(1, 2)).rejects.toThrow(
        AccountHasRecurrencesError,
      );
      await expect(ctx.investments.assertCanDelete(1, 3)).rejects.toThrow(
        InvestmentHasRecurrencesError,
      );
      expect(ctx.findOpenByTarget.mock.calls).toEqual([
        [1, { accountId: 2 }, '2026-11-05'],
        [1, { investmentId: 3 }, '2026-11-05'],
      ]);
    },
  );

  it('allows deletion when no open recurrence references the target', async () => {
    const ctx = setup();

    await expect(ctx.accounts.assertCanDelete(1, 2)).resolves.toBeUndefined();
    await expect(
      ctx.investments.assertCanDelete(1, 3),
    ).resolves.toBeUndefined();
    await ctx.investments.archive(1, 3, PendingOperationsDecision.CANCEL);
    expect(ctx.update).not.toHaveBeenCalled();
  });

  it.each([PendingOperationsDecision.KEEP, undefined])(
    'pauses active recurrences on archive with %s without touching paused cursors',
    async (decision) => {
      const active = buildRecurrence({ id: 1, generatedThrough: '2027-11-30' });

      const paused = buildRecurrence({
        id: 2,
        state: RecurrenceState.PAUSED,
        generatedThrough: '2026-10-01',
      });

      const ctx = setup([active, paused]);

      await ctx.investments.archive(1, 3, decision);
      expect(ctx.update).toHaveBeenCalledTimes(1);
      expect(ctx.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          state: RecurrenceState.PAUSED,
          generatedThrough: '2026-11-04',
        }),
      );
    },
  );

  it('ends active and paused recurrences on CANCEL, preserving the processed cursor', async () => {
    const ctx = setup([
      buildRecurrence({ id: 1, generatedThrough: '2027-11-30' }),
      buildRecurrence({
        id: 2,
        state: RecurrenceState.PAUSED,
        generatedThrough: '2026-10-01',
      }),
    ]);

    await ctx.investments.archive(1, 3, PendingOperationsDecision.CANCEL);
    expect(ctx.update).toHaveBeenCalledTimes(2);
    expect(
      ctx.update.mock.calls.map(([recurrence]) => recurrence.state),
    ).toEqual([RecurrenceState.ENDED, RecurrenceState.ENDED]);
    expect(ctx.update.mock.calls[0][0].generatedThrough).toBe('2027-11-30');
    expect(ctx.update.mock.calls[1][0].generatedThrough).toBe('2026-10-01');
  });
});
