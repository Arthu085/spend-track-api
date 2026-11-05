import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import { AccountEntity } from '@modules/accounts/domain/entities/account.entity';
import { AccountType } from '@modules/accounts/domain/enums/account-type.enum';
import { AccountOrmEntity } from '@modules/accounts/infrastructure/persistence/entities/account.orm-entity';
import { TypeOrmAccountRepository } from '@modules/accounts/infrastructure/persistence/repositories/typeorm-account.repository';
import { CreditCardOrmEntity } from '@modules/credit-cards/infrastructure/persistence/entities/credit-card.orm-entity';
import { InvestmentMovementEntity } from '@modules/investments/domain/entities/investment-movement.entity';
import { InvestmentEntity } from '@modules/investments/domain/entities/investment.entity';
import { ContributionKind } from '@modules/investments/domain/enums/contribution-kind.enum';
import { InvestmentType } from '@modules/investments/domain/enums/investment-type.enum';
import { AdditionalContributionAlreadyExistsError } from '@modules/investments/domain/errors/additional-contribution-already-exists.error';
import { InvestmentMovementOrmEntity } from '@modules/investments/infrastructure/persistence/entities/investment-movement.orm-entity';
import { InvestmentOrmEntity } from '@modules/investments/infrastructure/persistence/entities/investment.orm-entity';
import { TypeOrmInvestmentMovementRepository } from '@modules/investments/infrastructure/persistence/repositories/typeorm-investment-movement.repository';
import { TypeOrmInvestmentRepository } from '@modules/investments/infrastructure/persistence/repositories/typeorm-investment.repository';
import { TransactionCategoryOrmEntity } from '@modules/transaction-categories/infrastructure/persistence/entities/transaction-category.orm-entity';
import { TransactionState } from '@modules/transactions';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { RecurrenceEntity } from '../../../../domain/entities/recurrence.entity';
import { AdditionalContributionStrategy } from '../../../../domain/enums/additional-contribution-strategy.enum';
import { RecurrenceFrequency } from '../../../../domain/enums/recurrence-frequency.enum';
import { RecurrenceType } from '../../../../domain/enums/recurrence-type.enum';
import { RecurrenceOrmEntity } from '../../entities/recurrence.orm-entity';
import { TypeOrmRecurrenceRepository } from '../typeorm-recurrence.repository';

const TODAY = '2026-11-05';
const HORIZON = '2027-11-30';

describe('contribution recurrence repositories (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let recurrences: TypeOrmRecurrenceRepository;
  let movements: TypeOrmInvestmentMovementRepository;
  let investments: TypeOrmInvestmentRepository;
  let accounts: TypeOrmAccountRepository;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        CoreConfigModule,
        DatabaseModule,
        TypeOrmModule.forFeature([
          RecurrenceOrmEntity,
          InvestmentOrmEntity,
          InvestmentMovementOrmEntity,
          AccountOrmEntity,
          CreditCardOrmEntity,
          TransactionCategoryOrmEntity,
          UserOrmEntity,
        ]),
      ],
      providers: [
        TypeOrmRecurrenceRepository,
        TypeOrmInvestmentMovementRepository,
        TypeOrmInvestmentRepository,
        TypeOrmAccountRepository,
      ],
    }).compile();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
    recurrences = moduleRef.get(TypeOrmRecurrenceRepository);
    movements = moduleRef.get(TypeOrmInvestmentMovementRepository);
    investments = moduleRef.get(TypeOrmInvestmentRepository);
    accounts = moduleRef.get(TypeOrmAccountRepository);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "investment_movements", "recurrences", "investments", "accounts", "users" RESTART IDENTITY CASCADE',
    );
  });

  async function ownerWithTargets(): Promise<{
    ownerId: number;
    investment: InvestmentEntity;
    account: AccountEntity;
  }> {
    const users = dataSource.getRepository(UserOrmEntity);

    const { id: ownerId } = await users.save(
      users.create({
        name: 'Owner',
        email: `${randomUUID()}@example.com`,
        password: 'hash',
      }),
    );

    const investment = await investments.create(
      InvestmentEntity.create({
        uuid: randomUUID(),
        ownerId,
        name: 'Reserve',
        type: InvestmentType.RESERVE,
        targetAmount: null,
      }),
    );

    const account = await accounts.create(
      AccountEntity.create({
        uuid: randomUUID(),
        ownerId,
        name: 'Bank',
        type: AccountType.CHECKING,
        openingBalance: 0,
        openingBalanceDate: '2026-01-01',
        isDefault: false,
      }),
    );

    return { ownerId, investment, account };
  }

  function createRecurrence(
    {
      ownerId,
      investment,
      account,
    }: Awaited<ReturnType<typeof ownerWithTargets>>,
    withStrategy = true,
  ): Promise<RecurrenceEntity> {
    return recurrences.create(
      RecurrenceEntity.create({
        uuid: randomUUID(),
        ownerId,
        type: RecurrenceType.INVESTMENT_CONTRIBUTION,
        description: 'Reserve',
        amount: 70000,
        frequency: RecurrenceFrequency.MONTHLY,
        startDate: '2026-11-05',
        endDate: null,
        account,
        creditCard: null,
        investment,
        category: null,
        notes: null,
        savingStrategy: withStrategy
          ? {
              minimumRetainedBalance: 20000,
              additionalContribution:
                AdditionalContributionStrategy.REMAINING_SURPLUS,
            }
          : null,
      }),
    );
  }

  function createMandatory(
    recurrence: RecurrenceEntity,
    {
      ownerId,
      investment,
      account,
    }: Awaited<ReturnType<typeof ownerWithTargets>>,
    date: string,
  ): Promise<InvestmentMovementEntity> {
    return movements.create(
      InvestmentMovementEntity.createMandatoryContribution({
        uuid: randomUUID(),
        ownerId,
        investmentId: investment.id,
        account,
        amount: 70000,
        date,
        recurrence: { id: recurrence.id, uuid: recurrence.uuid },
      }),
    );
  }

  function createAdditional(
    recurrence: RecurrenceEntity,
    {
      ownerId,
      investment,
      account,
    }: Awaited<ReturnType<typeof ownerWithTargets>>,
    state: TransactionState.PLANNED | TransactionState.COMPLETED,
  ): Promise<InvestmentMovementEntity> {
    return movements.create(
      InvestmentMovementEntity.createAdditionalContribution({
        uuid: randomUUID(),
        ownerId,
        investmentId: investment.id,
        account,
        amount: 60000,
        date: '2026-11-10',
        state,
        recurrence: { id: recurrence.id, uuid: recurrence.uuid },
        surplusMonth: '2026-11-01',
        suggestedAmount: 55000,
        retainedMinimum: 20000,
      }),
    );
  }

  it('stores and reloads a contribution with its strategy and no category', async () => {
    const targets = await ownerWithTargets();
    const recurrence = await createRecurrence(targets);

    await createRecurrence(targets, false);

    const [listed, ...others] = await recurrences.findWithSavingStrategyByOwner(
      targets.ownerId,
    );

    expect(others).toEqual([]);
    expect(listed).toMatchObject({
      uuid: recurrence.uuid,
      category: null,
      investment: { uuid: targets.investment.uuid },
      savingStrategy: {
        minimumRetainedBalance: 20000,
        additionalContribution:
          AdditionalContributionStrategy.REMAINING_SURPLUS,
      },
    });
  });

  it('is due for generation only while the investment is active and not deleted', async () => {
    const targets = await ownerWithTargets();

    await createRecurrence(targets);

    const dueNow = () => recurrences.findDueForGeneration(HORIZON, TODAY, 10);

    await expect(dueNow()).resolves.toHaveLength(1);

    const archived = await investments.update(
      targets.investment.withStatus(RecordStatus.INACTIVE),
    );

    await expect(dueNow()).resolves.toEqual([]);

    await investments.update(archived.withStatus(RecordStatus.ACTIVE));

    await expect(dueNow()).resolves.toHaveLength(1);

    await dataSource.getRepository(InvestmentOrmEntity).softDelete({
      id: targets.investment.id,
    });

    await expect(dueNow()).resolves.toEqual([]);
  });

  it('never allows a second mandatory row for a date, canceled or not, until it is deleted', async () => {
    const targets = await ownerWithTargets();
    const recurrence = await createRecurrence(targets);

    const first = await createMandatory(recurrence, targets, '2026-11-05');

    await expect(
      createMandatory(recurrence, targets, '2026-11-05'),
    ).rejects.toThrow(QueryFailedError);

    const canceled = await movements.update(first.cancel());

    await expect(
      createMandatory(recurrence, targets, '2026-11-05'),
    ).rejects.toThrow(QueryFailedError);

    await movements.softDelete(canceled);

    await expect(
      createMandatory(recurrence, targets, '2026-11-05'),
    ).resolves.toMatchObject({ contributionKind: ContributionKind.MANDATORY });
  });

  it('answers the domain error to a second live additional, and frees the month on cancel', async () => {
    const targets = await ownerWithTargets();
    const recurrence = await createRecurrence(targets);

    const first = await createAdditional(
      recurrence,
      targets,
      TransactionState.PLANNED,
    );

    await expect(
      createAdditional(recurrence, targets, TransactionState.COMPLETED),
    ).rejects.toThrow(AdditionalContributionAlreadyExistsError);

    await movements.update(first.cancel());

    const second = await createAdditional(
      recurrence,
      targets,
      TransactionState.COMPLETED,
    );

    const live = await movements.findLiveAdditionalByMonth(
      targets.ownerId,
      [recurrence.id],
      '2026-11-01',
    );

    expect(live.map(({ uuid }) => uuid)).toEqual([second.uuid]);
    expect(live[0]).toMatchObject({
      recurrence: { uuid: recurrence.uuid, occurrenceDate: null },
      surplusMonth: '2026-11-01',
      suggestedAmount: 55000,
      retainedMinimum: 20000,
    });
  });

  it('reads planned and completed mandatory rows, without soft-deleted or additional ones', async () => {
    const targets = await ownerWithTargets();
    const recurrence = await createRecurrence(targets);

    const november = await createMandatory(recurrence, targets, '2026-11-05');
    const december = await createMandatory(recurrence, targets, '2026-12-05');
    const january = await createMandatory(recurrence, targets, '2027-01-05');

    await createAdditional(recurrence, targets, TransactionState.PLANNED);

    await movements.update(november.complete('2026-11-05'));
    await movements.softDelete(january);

    await expect(
      movements.findPlannedMandatoryThrough(
        targets.ownerId,
        [recurrence.id],
        '2027-12-31',
      ),
    ).resolves.toEqual([expect.objectContaining({ uuid: december.uuid })]);

    await expect(
      movements.findPlannedMandatoryByRecurrence(
        targets.ownerId,
        recurrence.id,
        '2026-12-06',
      ),
    ).resolves.toEqual([]);

    const completed = await movements.sumCompletedMandatoryByRecurrence(
      targets.ownerId,
      [recurrence.id],
      { from: '2026-11-01', to: '2026-11-30' },
    );

    expect(completed.get(recurrence.id)).toBe(70000);

    await expect(
      movements.findMandatoryDatesFrom(
        targets.ownerId,
        recurrence.id,
        '2026-11-01',
      ),
    ).resolves.toEqual(expect.arrayContaining(['2026-11-05', '2026-12-05']));

    const page = await movements.findPaginatedMandatoryByRecurrence(
      targets.ownerId,
      recurrence.id,
      0,
      10,
      { from: '2026-12-01', to: '2026-12-31', state: TransactionState.PLANNED },
    );

    expect(page.total).toBe(1);
    expect(page.items[0].uuid).toBe(december.uuid);

    await expect(
      movements.findMandatoryByUuidForRecurrence(january.uuid, recurrence.id),
    ).resolves.toBeNull();

    const totals = await movements.sumContributionsByKindAndState(
      targets.ownerId,
      { from: '2026-11-01', to: '2026-11-30' },
    );

    expect(totals).toEqual(
      expect.arrayContaining([
        {
          kind: ContributionKind.MANDATORY,
          state: TransactionState.COMPLETED,
          total: 70000,
        },
        {
          kind: ContributionKind.ADDITIONAL,
          state: TransactionState.PLANNED,
          total: 60000,
        },
      ]),
    );

    const projected = await movements.sumAccountChanges(
      targets.ownerId,
      [targets.account.id],
      { state: TransactionState.PLANNED },
    );

    expect(projected.get(targets.account.id)).toBe(-130000);
  });

  it('enforces the recurrence and movement shape in PostgreSQL', async () => {
    const targets = await ownerWithTargets();
    const recurrence = await createRecurrence(targets);
    const movement = await createMandatory(recurrence, targets, '2026-11-05');

    await expect(
      dataSource.query(
        `UPDATE recurrences SET investment_id = NULL WHERE id = $1`,
        [recurrence.id],
      ),
    ).rejects.toThrow('chk_recurrences_investment_contribution');

    await expect(
      dataSource.query(
        `UPDATE recurrences SET minimum_retained_balance = -1 WHERE id = $1`,
        [recurrence.id],
      ),
    ).rejects.toThrow('chk_recurrences_saving_strategy');

    await expect(
      dataSource.query(
        `UPDATE recurrences SET frequency = 'WEEKLY' WHERE id = $1`,
        [recurrence.id],
      ),
    ).rejects.toThrow('chk_recurrences_saving_strategy');

    await expect(
      dataSource.query(
        `UPDATE recurrences SET account_id = NULL, credit_card_id = NULL WHERE id = $1`,
        [recurrence.id],
      ),
    ).rejects.toThrow('chk_recurrences');

    await expect(
      dataSource.query(
        `UPDATE investment_movements SET recurrence_date = NULL WHERE id = $1`,
        [movement.id],
      ),
    ).rejects.toThrow('chk_investment_movements_contribution_kind');

    await expect(
      dataSource.query(
        `UPDATE investment_movements SET contribution_kind = 'ONE_TIME' WHERE id = $1`,
        [movement.id],
      ),
    ).rejects.toThrow('chk_investment_movements_contribution_kind');
  });
});
