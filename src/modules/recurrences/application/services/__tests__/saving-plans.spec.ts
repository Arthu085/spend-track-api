import type { AccountLedger } from '@modules/accounts';
import type { CreditCardStatements } from '@modules/credit-cards';
import {
  InvestmentMovementEntity,
  type InvestmentMovementRepository,
} from '@modules/investments';
import {
  TransactionState,
  type TransactionRepository,
} from '@modules/transactions';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { buildAccount } from '@test/support/builders/account.builder';
import {
  buildCreditCardInvoice,
  buildInvoiceStatement,
} from '@test/support/builders/credit-card.builder';
import { buildInvestment } from '@test/support/builders/investment.builder';
import { buildRecurrence } from '@test/support/builders/recurrence.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import { AdditionalContributionStrategy } from '../../../domain/enums/additional-contribution-strategy.enum';
import { RecurrenceState } from '../../../domain/enums/recurrence-state.enum';
import { RecurrenceType } from '../../../domain/enums/recurrence-type.enum';
import type { RecurrenceCardChargeRepository } from '../../../domain/repositories/recurrence-card-charge.repository';
import type { RecurrenceRepository } from '../../../domain/repositories/recurrence.repository';
import { SavingPlans } from '../saving-plans';

const TODAY = '2026-11-05';
const NOVEMBER = { year: 2026, month: 11 };

const account = buildAccount({
  id: 3,
  openingBalance: 150000,
  openingBalanceDate: '2026-01-01',
});

const recurrenceWith = (
  overrides: Parameters<typeof buildRecurrence>[0] = {},
) =>
  buildRecurrence({
    id: 9,
    type: RecurrenceType.INVESTMENT_CONTRIBUTION,
    investment: buildInvestment({ id: 7 }),
    category: null,
    account,
    amount: 70000,
    savingStrategy: {
      minimumRetainedBalance: 20000,
      additionalContribution: AdditionalContributionStrategy.REMAINING_SURPLUS,
    },
    ...overrides,
  });

const mandatory = (date: string, accountOfRow = account) =>
  InvestmentMovementEntity.createMandatoryContribution({
    uuid: `movement-${date}`,
    ownerId: 1,
    investmentId: 7,
    account: accountOfRow,
    amount: 70000,
    date,
    recurrence: { id: 9, uuid: 'recurrence-uuid' },
  });

function setup(stored = [recurrenceWith()], planned = [mandatory(TODAY)]) {
  const movements = {
    sumAccountChanges: jest
      .fn()
      .mockResolvedValue(
        new Map([
          [
            account.id,
            -planned.reduce((total, { amount }) => total + amount, 0),
          ],
        ]),
      ),
    findPlannedMandatoryThrough: jest.fn().mockResolvedValue(planned),
    sumCompletedMandatoryByRecurrence: jest
      .fn()
      .mockResolvedValue(new Map([[9, 5000]])),
    findLiveAdditionalByMonth: jest.fn().mockResolvedValue([]),
  };

  const findPlannedDueThrough = jest
    .fn()
    .mockResolvedValue({ items: [], count: 0, total: 2500 });

  const forOwner = jest.fn().mockResolvedValue([
    buildInvoiceStatement({
      outstanding: 10000,
      invoice: buildCreditCardInvoice({ referenceMonth: '2026-11-01' }),
    }),
    buildInvoiceStatement({
      outstanding: 99999,
      invoice: buildCreditCardInvoice({ referenceMonth: '2026-12-01' }),
    }),
  ]);

  const service = new SavingPlans(
    mockOf<RecurrenceRepository>({
      findWithSavingStrategyByOwner: jest.fn().mockResolvedValue(stored),
    }),
    mockOf<AccountLedger>({
      balanceChanges: jest.fn().mockResolvedValue(new Map()),
    }),
    mockOf<TransactionRepository>({
      sumBalanceChanges: jest
        .fn()
        .mockResolvedValue(new Map([[account.id, -1000]])),
    }),
    mockOf<InvestmentMovementRepository>(movements),
    mockOf<RecurrenceCardChargeRepository>({ findPlannedDueThrough }),
    mockOf<CreditCardStatements>({ forOwner }),
  );

  return { service, movements, forOwner, findPlannedDueThrough };
}

describe('SavingPlans', () => {
  it('reads primitive balances for one month and charges every card obligation', async () => {
    const { service, findPlannedDueThrough } = setup();

    const [plan] = await service.forMonth(1, NOVEMBER, TODAY);

    expect(findPlannedDueThrough).toHaveBeenCalledWith(1, '2026-11-01', 1);
    expect(plan).toMatchObject({
      month: '2026-11-01',
      state: RecurrenceState.ACTIVE,
      actualBalance: 150000,
      plannedTransactions: -1000,
      otherInvestmentMovements: 0,
      cardObligations: 12500,
      balanceBeforeContribution: 136500,
      distributable: 116500,
      shortfall: 0,
      suggestedAdditional: 46500,
      canAcceptAdditional: true,
      additional: null,
      mandatory: {
        planned: 70000,
        completed: 5000,
        plannedOccurrences: [
          {
            uuid: `movement-${TODAY}`,
            date: TODAY,
            amount: 70000,
            overdue: false,
          },
        ],
      },
    });
  });

  it('uses the obligations it is handed, without reading the cards again', async () => {
    const { service, forOwner, findPlannedDueThrough } = setup();

    const [plan] = await service.forMonth(1, NOVEMBER, TODAY, 500);

    expect(plan.cardObligations).toBe(500);
    expect(forOwner).not.toHaveBeenCalled();
    expect(findPlannedDueThrough).not.toHaveBeenCalled();
  });

  it('flags overdue occurrences and leaves out those still on a former account', async () => {
    const { service } = setup(undefined, [
      mandatory('2026-10-05'),
      mandatory('2026-10-06', buildAccount({ id: 99 })),
    ]);

    const [plan] = await service.forMonth(1, NOVEMBER, TODAY, 0);

    expect(plan.mandatory).toMatchObject({
      planned: 70000,
      plannedOccurrences: [{ date: '2026-10-05', overdue: true }],
    });
  });

  it.each([
    ['paused', { state: RecurrenceState.PAUSED }],
    ['past its end date', { endDate: '2026-10-01', startDate: '2026-01-01' }],
    [
      'of an archived investment',
      { investment: buildInvestment({ status: RecordStatus.INACTIVE }) },
    ],
    [
      'of a deleted investment',
      { investment: buildInvestment({ deletedAt: new Date() }) },
    ],
    [
      'of an inactive account',
      { account: buildAccount({ status: RecordStatus.INACTIVE }) },
    ],
    [
      'of a deleted account',
      { account: buildAccount({ deletedAt: new Date() }) },
    ],
    ['without a strategy', { savingStrategy: null }],
  ])('skips a recurrence %s, reading nothing else', async (_, overrides) => {
    const { service, movements } = setup([recurrenceWith(overrides)]);

    await expect(service.forMonth(1, NOVEMBER, TODAY)).resolves.toEqual([]);
    expect(movements.sumAccountChanges).not.toHaveBeenCalled();
  });

  it('reports the live additional contribution of the month', async () => {
    const { service, movements } = setup();

    const additional = InvestmentMovementEntity.createAdditionalContribution({
      uuid: 'additional',
      ownerId: 1,
      investmentId: 7,
      account,
      amount: 60000,
      date: TODAY,
      state: TransactionState.PLANNED,
      recurrence: { id: 9, uuid: 'recurrence-uuid' },
      surplusMonth: '2026-11-01',
      suggestedAmount: 60000,
      retainedMinimum: 20000,
    });

    movements.findLiveAdditionalByMonth.mockResolvedValue([additional]);

    const plan = await service.forRecurrence(recurrenceWith(), NOVEMBER, TODAY);

    expect(plan).toMatchObject({
      additional,
      suggestedAdditional: 0,
      canAcceptAdditional: false,
    });
  });

  it('computes a past month without suggesting', async () => {
    const { service } = setup();

    const [plan] = await service.forMonth(
      1,
      { year: 2026, month: 10 },
      TODAY,
      0,
    );

    expect(plan).toMatchObject({
      suggestedAdditional: 0,
      canAcceptAdditional: false,
    });
  });

  it('lists a recurrence only from the month of its start through the month of its end', async () => {
    const { service } = setup([
      recurrenceWith({ startDate: '2026-11-20', endDate: '2027-01-10' }),
    ]);

    const listed = async (year: number, month: number) =>
      (await service.forMonth(1, { year, month }, TODAY, 0)).length;

    await expect(listed(2026, 10)).resolves.toBe(0);
    await expect(listed(2026, 11)).resolves.toBe(1);
    await expect(listed(2027, 1)).resolves.toBe(1);
    await expect(listed(2027, 2)).resolves.toBe(0);
  });

  it('leaves out a recurrence whose investment or account was deleted', async () => {
    const deletedAt = new Date('2026-11-01T00:00:00Z');

    const { service } = setup([
      recurrenceWith({ investment: buildInvestment({ deletedAt }) }),
      recurrenceWith({ account: buildAccount({ deletedAt }) }),
    ]);

    await expect(service.forMonth(1, NOVEMBER, TODAY, 0)).resolves.toEqual([]);
  });

  it('refuses a recurrence without a strategy when asked for it directly', async () => {
    const { service } = setup();

    await expect(
      service.forRecurrence(buildRecurrence(), NOVEMBER, TODAY),
    ).rejects.toThrow('saving strategy');
  });
});
