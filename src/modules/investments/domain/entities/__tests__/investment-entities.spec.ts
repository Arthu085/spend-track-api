import { TransactionState } from '@modules/transactions';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { buildAccount } from '@test/support/builders/account.builder';
import { buildInvestmentMovement } from '@test/support/builders/investment.builder';
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
