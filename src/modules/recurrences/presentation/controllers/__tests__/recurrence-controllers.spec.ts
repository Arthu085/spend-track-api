import { ContributionKind } from '@modules/investments';
import { TransactionState } from '@modules/transactions';
import { PaginatedResult } from '@shared/application/dto';
import type { Translate } from '@shared/presentation/decorators';
import type { AuthenticatedUser } from '@shared/presentation/http';
import { buildCreditCard } from '@test/support/builders/credit-card.builder';
import { buildAccount } from '@test/support/builders/account.builder';
import {
  buildInvestment,
  buildInvestmentMovement,
} from '@test/support/builders/investment.builder';
import { buildRecurrence } from '@test/support/builders/recurrence.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import type { RecurrenceOccurrence } from '../../../application/services/recurrence-occurrence';
import type { SavingPlan } from '../../../application/services/saving-plans';
import type { AcceptAdditionalContributionUseCase } from '../../../application/use-cases/accept-additional-contribution.use-case';
import type { ListSavingPlansUseCase } from '../../../application/use-cases/list-saving-plans.use-case';
import type { CancelRecurrenceOccurrenceUseCase } from '../../../application/use-cases/cancel-recurrence-occurrence.use-case';
import type { ConfirmRecurrenceOccurrenceUseCase } from '../../../application/use-cases/confirm-recurrence-occurrence.use-case';
import type { CreateRecurrenceUseCase } from '../../../application/use-cases/create-recurrence.use-case';
import type { EndRecurrenceUseCase } from '../../../application/use-cases/end-recurrence.use-case';
import type { GetRecurrenceUseCase } from '../../../application/use-cases/get-recurrence.use-case';
import type { ListRecurrenceOccurrencesUseCase } from '../../../application/use-cases/list-recurrence-occurrences.use-case';
import type { ListRecurrencesUseCase } from '../../../application/use-cases/list-recurrences.use-case';
import type { UpdateRecurrenceOccurrenceUseCase } from '../../../application/use-cases/update-recurrence-occurrence.use-case';
import type { UpdateRecurrenceStateUseCase } from '../../../application/use-cases/update-recurrence-state.use-case';
import type { UpdateRecurrenceUseCase } from '../../../application/use-cases/update-recurrence.use-case';
import { AdditionalContributionStrategy } from '../../../domain/enums/additional-contribution-strategy.enum';
import { RecurrenceFrequency } from '../../../domain/enums/recurrence-frequency.enum';
import { RecurrenceState } from '../../../domain/enums/recurrence-state.enum';
import { RecurrenceType } from '../../../domain/enums/recurrence-type.enum';
import { RecurrenceUpdateScope } from '../../../domain/enums/recurrence-update-scope.enum';
import { AcceptAdditionalContributionDto } from '../../dto/input/accept-additional-contribution.dto';
import { ListRecurrenceOccurrencesQueryDto } from '../../dto/input/list-recurrence-occurrences-query.dto';
import { ListRecurrencesQueryDto } from '../../dto/input/list-recurrences-query.dto';
import { SavingPlansQueryDto } from '../../dto/input/saving-plans-query.dto';
import { RecurrenceResponseDto } from '../../dto/output/recurrence.response';
import { RecurrenceOccurrencesController } from '../recurrence-occurrences.controller';
import { RecurrenceSavingPlansController } from '../recurrence-saving-plans.controller';
import { RecurrencesController } from '../recurrences.controller';

const translate: Translate = (key) => `t:${key}`;

const actor: AuthenticatedUser = {
  id: 21,
  uuid: 'actor-uuid',
  email: 'actor@example.com',
  name: 'Actor',
  roles: ['ADMIN'],
};

const executing = <T>(value: T) => ({
  execute: jest.fn().mockResolvedValue(value),
});

describe('RecurrencesController', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-03T15:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function build(recurrence = buildRecurrence()) {
    const use = {
      list: executing(PaginatedResult.of([recurrence], 1, 1, 20)),
      get: executing(recurrence),
      create: executing(recurrence),
      update: executing(recurrence),
      state: executing(recurrence),
      end: executing(recurrence),
    };

    return {
      use,
      controller: new RecurrencesController(
        mockOf<ListRecurrencesUseCase>(use.list),
        mockOf<GetRecurrenceUseCase>(use.get),
        mockOf<CreateRecurrenceUseCase>(use.create),
        mockOf<UpdateRecurrenceUseCase>(use.update),
        mockOf<UpdateRecurrenceStateUseCase>(use.state),
        mockOf<EndRecurrenceUseCase>(use.end),
      ),
    };
  }

  it('serializes a recurrence with labels, its next date, and its target', async () => {
    const { controller, use } = build();

    const result = await controller.findOne(
      'recurrence-uuid',
      actor,
      translate,
    );

    expect(use.get.execute).toHaveBeenCalledWith({
      uuid: 'recurrence-uuid',
      ownerId: 21,
    });
    expect(result).toMatchObject({
      type: RecurrenceType.EXPENSE,
      typeLabel: 't:transactions.type.expense',
      amount: '1500.00',
      frequencyLabel: 't:recurrences.frequency.monthly',
      state: RecurrenceState.ACTIVE,
      stateLabel: 't:recurrences.state.active',
      nextOccurrenceDate: '2026-11-15',
      account: { uuid: 'account-uuid' },
      creditCard: null,
    });
  });

  it('serializes a card recurrence whose end date passed as ENDED', async () => {
    const { controller } = build(
      buildRecurrence({
        account: null,
        creditCard: buildCreditCard(),
        endDate: '2026-11-01',
      }),
    );

    const page = await controller.findAll(
      new ListRecurrencesQueryDto(),
      actor,
      translate,
    );

    expect(page.items[0]).toMatchObject({
      state: RecurrenceState.ENDED,
      nextOccurrenceDate: null,
      account: null,
      creditCard: { uuid: 'card-uuid' },
    });
  });

  it('passes parsed amounts and the caller to the write use-cases', async () => {
    const { controller, use } = build();

    await controller.create(
      {
        type: RecurrenceType.EXPENSE,
        description: 'Rent',
        amount: '1500.00',
        frequency: RecurrenceFrequency.MONTHLY,
        startDate: '2026-11-15',
        accountUuid: 'account',
        categoryUuid: 'category',
      },
      actor,
      translate,
    );
    await controller.update(
      'recurrence-uuid',
      { scope: RecurrenceUpdateScope.ALL, amount: '1600.00' },
      actor,
      translate,
    );
    await controller.update(
      'recurrence-uuid',
      { scope: RecurrenceUpdateScope.FUTURE, description: 'Rent' },
      actor,
      translate,
    );
    await controller.updateState(
      'recurrence-uuid',
      { state: RecurrenceState.PAUSED },
      actor,
      translate,
    );
    await controller.end(
      'recurrence-uuid',
      { fromInvoiceMonth: '2026-12-01' },
      actor,
      translate,
    );

    expect(use.create.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 21,
        amount: 150000,
        endDate: null,
        creditCardUuid: undefined,
        notes: null,
      }),
    );
    expect(use.update.execute).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ amount: 160000, scope: 'ALL' }),
    );
    expect(use.update.execute).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ amount: undefined, description: 'Rent' }),
    );
    expect(use.state.execute).toHaveBeenCalledWith({
      uuid: 'recurrence-uuid',
      ownerId: 21,
      state: RecurrenceState.PAUSED,
    });
    expect(use.end.execute).toHaveBeenCalledWith({
      uuid: 'recurrence-uuid',
      ownerId: 21,
      from: undefined,
      fromInvoiceMonth: '2026-12-01',
    });
  });
});

describe('RecurrenceOccurrencesController', () => {
  const occurrence: RecurrenceOccurrence = {
    uuid: 'charge',
    occurrenceDate: '2026-11-15',
    date: '2026-11-15',
    amount: 5590,
    description: 'Netflix',
    state: TransactionState.PLANNED,
    completedOn: null,
    transactionUuid: null,
    purchaseUuid: null,
    movementUuid: null,
    invoiceMonth: '2026-12-01',
  };

  function build() {
    const use = {
      list: executing(PaginatedResult.of([occurrence], 1, 1, 20)),
      update: executing(occurrence),
      confirm: executing(occurrence),
      cancel: executing(occurrence),
    };

    return {
      use,
      controller: new RecurrenceOccurrencesController(
        mockOf<ListRecurrenceOccurrencesUseCase>(use.list),
        mockOf<UpdateRecurrenceOccurrenceUseCase>(use.update),
        mockOf<ConfirmRecurrenceOccurrenceUseCase>(use.confirm),
        mockOf<CancelRecurrenceOccurrenceUseCase>(use.cancel),
      ),
    };
  }

  it('serializes occurrences with decimal amounts and state labels', async () => {
    const { controller, use } = build();

    const page = await controller.findAll(
      'recurrence-uuid',
      Object.assign(new ListRecurrenceOccurrencesQueryDto(), {
        state: TransactionState.PLANNED,
      }),
      actor,
      translate,
    );

    expect(use.list.execute).toHaveBeenCalledWith(
      expect.objectContaining({ uuid: 'recurrence-uuid', ownerId: 21 }),
    );
    expect(page.items[0]).toEqual({
      ...occurrence,
      amount: '55.90',
      stateLabel: 't:transactions.state.planned',
    });
  });

  it('passes optional amounts and dates to edit, confirm, and skip', async () => {
    const { controller, use } = build();

    await controller.update(
      'recurrence-uuid',
      'charge',
      { amount: '59.90' },
      actor,
      translate,
    );
    await controller.confirm(
      'recurrence-uuid',
      'charge',
      { date: '2026-11-16' },
      actor,
      translate,
    );
    await controller.cancel('recurrence-uuid', 'charge', actor, translate);

    expect(use.update.execute).toHaveBeenCalledWith({
      uuid: 'recurrence-uuid',
      occurrenceUuid: 'charge',
      ownerId: 21,
      amount: 5990,
      date: undefined,
    });
    expect(use.confirm.execute).toHaveBeenCalledWith({
      uuid: 'recurrence-uuid',
      occurrenceUuid: 'charge',
      ownerId: 21,
      amount: undefined,
      date: '2026-11-16',
    });
    expect(use.cancel.execute).toHaveBeenCalledWith({
      uuid: 'recurrence-uuid',
      occurrenceUuid: 'charge',
      ownerId: 21,
    });
  });
});

describe('RecurrenceSavingPlansController', () => {
  const investment = buildInvestment({ uuid: 'reserve' });
  const account = buildAccount({ uuid: 'bank' });

  const recurrence = buildRecurrence({
    type: RecurrenceType.INVESTMENT_CONTRIBUTION,
    investment,
    category: null,
    account,
    amount: 70000,
    savingStrategy: {
      minimumRetainedBalance: 20000,
      additionalContribution: AdditionalContributionStrategy.REMAINING_SURPLUS,
    },
  });

  const additional = buildInvestmentMovement({
    uuid: 'additional',
    amount: 60000,
    state: TransactionState.PLANNED,
    completedOn: null,
    contributionKind: ContributionKind.ADDITIONAL,
    recurrence: { id: 1, uuid: 'recurrence-uuid', occurrenceDate: null },
    surplusMonth: '2026-11-01',
    suggestedAmount: 60000,
    retainedMinimum: 20000,
  });

  const plan: SavingPlan = {
    recurrence,
    state: RecurrenceState.ACTIVE,
    investment,
    account,
    strategy: {
      minimumRetainedBalance: 20000,
      additionalContribution: AdditionalContributionStrategy.REMAINING_SURPLUS,
    },
    month: '2026-11-01',
    actualBalance: 150000,
    plannedTransactions: 0,
    otherInvestmentMovements: -60000,
    cardObligations: 0,
    balanceBeforeContribution: 90000,
    distributable: 70000,
    shortfall: 0,
    suggestedAdditional: 0,
    canAcceptAdditional: false,
    mandatory: {
      planned: 70000,
      completed: 0,
      plannedOccurrences: [
        {
          uuid: 'mandatory',
          date: '2026-11-05',
          amount: 70000,
          overdue: false,
        },
      ],
    },
    additional,
  };

  function build() {
    const list = executing([plan, { ...plan, additional: null }]);
    const accept = executing(additional);

    const controller = new RecurrenceSavingPlansController(
      mockOf<ListSavingPlansUseCase>(list),
      mockOf<AcceptAdditionalContributionUseCase>(accept),
    );

    return { controller, list, accept };
  }

  it('serializes the plans of the month with decimal amounts', async () => {
    const { controller, list } = build();

    const [withAdditional, without] = await controller.findAll(
      Object.assign(new SavingPlansQueryDto(), { year: 2026, month: 11 }),
      actor,
      translate,
    );

    expect(list.execute).toHaveBeenCalledWith({
      ownerId: 21,
      year: 2026,
      month: 11,
    });
    expect(withAdditional).toMatchObject({
      recurrence: {
        uuid: recurrence.uuid,
        amount: '700.00',
        state: RecurrenceState.ACTIVE,
        stateLabel: 't:recurrences.state.active',
        frequencyLabel: 't:recurrences.frequency.monthly',
      },
      investment: {
        uuid: 'reserve',
        typeLabel: 't:investments.type.reserve',
      },
      account: { uuid: 'bank' },
      month: '2026-11-01',
      actualBalance: '1500.00',
      otherInvestmentMovements: '-600.00',
      balanceBeforeContribution: '900.00',
      minimumRetainedBalance: '200.00',
      distributable: '700.00',
      shortfall: '0.00',
      additionalContribution: 'REMAINING_SURPLUS',
      additionalContributionLabel:
        't:recurrences.additional_contribution.remaining_surplus',
      mandatory: {
        planned: '700.00',
        completed: '0.00',
        plannedOccurrences: [
          { uuid: 'mandatory', amount: '700.00', overdue: false },
        ],
      },
      suggestedAdditional: '0.00',
      additional: {
        movementUuid: 'additional',
        amount: '600.00',
        state: TransactionState.PLANNED,
        suggestedAmount: '600.00',
      },
      canAcceptAdditional: false,
    });
    expect(without.additional).toBeNull();
  });

  it('accepts an additional contribution and returns the movement', async () => {
    const { controller, accept } = build();

    const response = await controller.accept(
      'recurrence-uuid',
      Object.assign(new AcceptAdditionalContributionDto(), {
        year: 2026,
        month: 11,
        amount: '600.00',
        state: TransactionState.PLANNED,
      }),
      actor,
      translate,
    );

    expect(accept.execute).toHaveBeenCalledWith({
      uuid: 'recurrence-uuid',
      ownerId: 21,
      year: 2026,
      month: 11,
      amount: 60000,
      date: undefined,
      state: TransactionState.PLANNED,
    });
    expect(response).toMatchObject({
      uuid: 'additional',
      contributionKind: 'ADDITIONAL',
      contributionKindLabel: 't:investments.contribution_kind.additional',
      recurrence: { uuid: 'recurrence-uuid', occurrenceDate: null },
      surplusMonth: '2026-11-01',
      suggestedAmount: '600.00',
      retainedMinimum: '200.00',
    });
  });
});

describe('RecurrenceResponseDto', () => {
  it('serializes a contribution with its investment and saving strategy', () => {
    const today = '2026-11-05';

    const dto = RecurrenceResponseDto.fromDomain(
      buildRecurrence({
        type: RecurrenceType.INVESTMENT_CONTRIBUTION,
        investment: buildInvestment({ uuid: 'reserve' }),
        category: null,
        savingStrategy: {
          minimumRetainedBalance: 20000,
          additionalContribution: AdditionalContributionStrategy.NONE,
        },
      }),
      today,
      translate,
    );

    expect(dto).toMatchObject({
      typeLabel: 't:recurrences.type.investment_contribution',
      category: null,
      investment: { uuid: 'reserve' },
      savingStrategy: {
        minimumRetainedBalance: '200.00',
        additionalContribution: 'NONE',
        additionalContributionLabel:
          't:recurrences.additional_contribution.none',
      },
    });
  });
});
