import {
  InvestmentEntity,
  type ReconstituteInvestmentInput,
} from '@modules/investments/domain/entities/investment.entity';
import {
  InvestmentMovementEntity,
  type ReconstituteInvestmentMovementInput,
} from '@modules/investments/domain/entities/investment-movement.entity';
import { ContributionKind } from '@modules/investments/domain/enums/contribution-kind.enum';
import { InvestmentMovementType } from '@modules/investments/domain/enums/investment-movement-type.enum';
import { InvestmentType } from '@modules/investments/domain/enums/investment-type.enum';
import { TransactionState } from '@modules/transactions';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { buildAccount } from './account.builder';

export function buildInvestment(
  overrides: Partial<ReconstituteInvestmentInput> = {},
): InvestmentEntity {
  return InvestmentEntity.reconstitute({
    id: 1,
    uuid: 'investment-uuid',
    status: RecordStatus.ACTIVE,
    ownerId: 1,
    name: 'Emergency reserve',
    type: InvestmentType.RESERVE,
    targetAmount: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  });
}

export function buildInvestmentMovement(
  overrides: Partial<ReconstituteInvestmentMovementInput> = {},
): InvestmentMovementEntity {
  return InvestmentMovementEntity.reconstitute({
    id: 1,
    uuid: 'movement-uuid',
    status: RecordStatus.ACTIVE,
    ownerId: 1,
    investmentId: 1,
    type: InvestmentMovementType.CONTRIBUTION,
    account: buildAccount(),
    amount: 10000,
    date: '2026-10-10',
    state: TransactionState.COMPLETED,
    completedOn: '2026-10-10',
    canceledAt: null,
    contributionKind: ContributionKind.ONE_TIME,
    recurrence: null,
    surplusMonth: null,
    suggestedAmount: null,
    retainedMinimum: null,
    createdAt: new Date('2026-10-10T00:00:00Z'),
    updatedAt: new Date('2026-10-10T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  });
}
