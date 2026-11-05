import { TransactionState } from '@modules/transactions';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { buildAccount } from '@test/support/builders/account.builder';
import { buildInvestmentMovement } from '@test/support/builders/investment.builder';
import { ContributionKind } from '../../enums/contribution-kind.enum';
import { InvestmentMovementType } from '../../enums/investment-movement-type.enum';
import { InvestmentType } from '../../enums/investment-type.enum';
import { InvestmentMovementStateTransitionError } from '../../errors/investment-movement-state-transition.error';
import { InvestmentMovementEntity } from '../investment-movement.entity';
import { InvestmentEntity } from '../investment.entity';

describe('InvestmentEntity', () => {
  it('starts active and keeps its identity when details or status change', () => {
    const created = InvestmentEntity.create({
      uuid: 'new',
      ownerId: 3,
      name: 'Trip',
      type: InvestmentType.GOAL,
      targetAmount: 500000,
    });

    const archived = created
      .withDetails({
        name: 'Japan',
        type: InvestmentType.GOAL,
        targetAmount: null,
      })
      .withStatus(RecordStatus.INACTIVE);

    expect(created.status).toBe(RecordStatus.ACTIVE);
    expect(archived).toMatchObject({
      uuid: 'new',
      ownerId: 3,
      name: 'Japan',
      targetAmount: null,
      status: RecordStatus.INACTIVE,
    });
  });
});

describe('InvestmentMovementEntity', () => {
  const account = buildAccount();

  function transfer(
    type:
      | InvestmentMovementType.CONTRIBUTION
      | InvestmentMovementType.WITHDRAWAL,
    state: TransactionState.PLANNED | TransactionState.COMPLETED,
  ): InvestmentMovementEntity {
    return InvestmentMovementEntity.createTransfer({
      uuid: 'm',
      ownerId: 1,
      investmentId: 1,
      type,
      account,
      amount: 5000,
      date: '2026-11-05',
      state,
      completedOn: null,
    });
  }

  it('defaults completedOn to the date of a completed movement only', () => {
    expect(
      transfer(InvestmentMovementType.CONTRIBUTION, TransactionState.COMPLETED)
        .completedOn,
    ).toBe('2026-11-05');
    expect(
      transfer(InvestmentMovementType.CONTRIBUTION, TransactionState.PLANNED)
        .completedOn,
    ).toBeNull();
  });

  it('changes the value only once completed, in the direction of its type', () => {
    expect(
      transfer(InvestmentMovementType.CONTRIBUTION, TransactionState.PLANNED)
        .valueChange,
    ).toBe(0);
    expect(
      transfer(InvestmentMovementType.CONTRIBUTION, TransactionState.COMPLETED)
        .valueChange,
    ).toBe(5000);
    expect(
      transfer(InvestmentMovementType.WITHDRAWAL, TransactionState.COMPLETED)
        .valueChange,
    ).toBe(-5000);
  });

  it('records a valuation as a completed signed change without an account', () => {
    const valuation = InvestmentMovementEntity.createValuation({
      uuid: 'v',
      ownerId: 1,
      investmentId: 1,
      change: -1250,
      date: '2026-11-03',
    });

    expect(valuation).toMatchObject({
      type: InvestmentMovementType.VALUATION,
      account: null,
      state: TransactionState.COMPLETED,
      completedOn: '2026-11-03',
      valueChange: -1250,
    });
  });

  it('completes a planned movement once and cancels it once', () => {
    const completed = buildInvestmentMovement({
      state: TransactionState.PLANNED,
      completedOn: null,
    }).complete('2026-11-06');

    expect(completed).toMatchObject({
      state: TransactionState.COMPLETED,
      completedOn: '2026-11-06',
    });
    expect(() => completed.complete('2026-11-07')).toThrow(
      InvestmentMovementStateTransitionError,
    );

    const canceled = completed.cancel();

    expect(canceled.state).toBe(TransactionState.CANCELED);
    expect(canceled.canceledAt).toBeInstanceOf(Date);
    expect(canceled.completedOn).toBe('2026-11-06');
    expect(canceled.valueChange).toBe(0);
    expect(() => canceled.cancel()).toThrow(
      InvestmentMovementStateTransitionError,
    );
  });
});

describe('InvestmentMovementEntity contribution kinds', () => {
  const shared = {
    uuid: 'new',
    ownerId: 3,
    investmentId: 7,
    account: buildAccount(),
    amount: 70000,
    date: '2026-11-15',
    recurrence: { id: 9, uuid: 'recurrence' },
  };

  it('marks transfers and valuations as one-time, with no recurrence', () => {
    const transfer = InvestmentMovementEntity.createTransfer({
      ...shared,
      type: InvestmentMovementType.CONTRIBUTION,
      state: TransactionState.PLANNED,
      completedOn: null,
    });

    const valuation = InvestmentMovementEntity.createValuation({
      uuid: 'valuation',
      ownerId: 3,
      investmentId: 7,
      change: 100,
      date: '2026-11-15',
    });

    for (const movement of [transfer, valuation]) {
      expect(movement).toMatchObject({
        contributionKind: ContributionKind.ONE_TIME,
        recurrence: null,
        surplusMonth: null,
        suggestedAmount: null,
        retainedMinimum: null,
      });
    }
  });

  it('creates a mandatory contribution as planned, on its scheduled date', () => {
    const movement =
      InvestmentMovementEntity.createMandatoryContribution(shared);

    expect(movement).toMatchObject({
      type: InvestmentMovementType.CONTRIBUTION,
      contributionKind: ContributionKind.MANDATORY,
      state: TransactionState.PLANNED,
      completedOn: null,
      recurrence: { id: 9, uuid: 'recurrence', occurrenceDate: '2026-11-15' },
    });
    expect(movement.valueChange).toBe(0);
  });

  it('snapshots an additional contribution, completed on its date when it moves money now', () => {
    const movement = InvestmentMovementEntity.createAdditionalContribution({
      ...shared,
      state: TransactionState.COMPLETED,
      surplusMonth: '2026-11-01',
      suggestedAmount: 60000,
      retainedMinimum: 20000,
    });

    expect(movement).toMatchObject({
      contributionKind: ContributionKind.ADDITIONAL,
      completedOn: '2026-11-15',
      recurrence: { id: 9, uuid: 'recurrence', occurrenceDate: null },
      surplusMonth: '2026-11-01',
      suggestedAmount: 60000,
      retainedMinimum: 20000,
    });
    expect(movement.valueChange).toBe(70000);

    const canceled = movement.cancel();

    expect(canceled).toMatchObject({
      suggestedAmount: 60000,
      retainedMinimum: 20000,
    });
  });

  it('changes the details of a planned movement only', () => {
    const planned =
      InvestmentMovementEntity.createMandatoryContribution(shared);

    const changed = planned.withPlannedDetails({
      amount: 80000,
      date: '2026-11-20',
      account: buildAccount({ id: 5 }),
    });

    expect(changed).toMatchObject({
      amount: 80000,
      date: '2026-11-20',
      recurrence: { occurrenceDate: '2026-11-15' },
    });
    expect(() =>
      changed.complete('2026-11-20').withPlannedDetails({
        amount: 1,
        date: '2026-11-20',
        account: buildAccount(),
      }),
    ).toThrow(InvestmentMovementStateTransitionError);
  });
});
