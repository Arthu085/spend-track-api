import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import { CoreI18nModule } from '@core/i18n';
import {
  AccountEntity,
  AccountType,
  ACCOUNT_REPOSITORY,
  type AccountRepository,
  AccountHasRecurrencesError,
  InactiveAccountError,
} from '@modules/accounts';
import { DeleteAccountUseCase } from '@modules/accounts/application/use-cases/delete-account.use-case';
import {
  InvestmentEntity,
  InvestmentType,
  INVESTMENT_REPOSITORY,
  INVESTMENT_MOVEMENT_REPOSITORY,
  type InvestmentRepository,
  type InvestmentMovementRepository,
  InvestmentHasRecurrencesError,
  InactiveInvestmentError,
} from '@modules/investments';
import { DeleteInvestmentUseCase } from '@modules/investments/application/use-cases/delete-investment.use-case';
import { UpdateInvestmentStatusUseCase } from '@modules/investments/application/use-cases/update-investment-status.use-case';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';
import { TransactionState } from '@modules/transactions';
import {
  financeToday,
  addMonthsToDate,
  addDaysToDate,
} from '@shared/domain/calendar';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { PendingOperationsDecision } from '@shared/domain/pending-operations';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { RecurrencesModule } from '../../../recurrences.module';
import { RecurrenceFrequency } from '../../../domain/enums/recurrence-frequency.enum';
import { RecurrenceType } from '../../../domain/enums/recurrence-type.enum';
import { RecurrenceState } from '../../../domain/enums/recurrence-state.enum';
import { RecurrenceEndedError } from '../../../domain/errors/recurrence-ended.error';
import {
  RECURRENCE_REPOSITORY,
  type RecurrenceRepository,
} from '../../../domain/repositories/recurrence.repository';
import { CreateRecurrenceUseCase } from '../../use-cases/create-recurrence.use-case';
import { UpdateRecurrenceStateUseCase } from '../../use-cases/update-recurrence-state.use-case';
import { EndRecurrenceUseCase } from '../../use-cases/end-recurrence.use-case';
import { RecurrenceOccurrenceGenerator } from '../recurrence-occurrence-generator';
import { RecurrenceReferences } from '../recurrence-references';

// Full module wiring matters: registry participants must be registered before deletion and archival.
describe('Recurrence target lifecycle (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let accounts: AccountRepository;
  let investments: InvestmentRepository;
  let movements: InvestmentMovementRepository;
  let recurrences: RecurrenceRepository;
  let transactions: TransactionManagerPort;
  const today = financeToday();

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        CoreConfigModule,
        DatabaseModule,
        CoreI18nModule,
        RecurrencesModule,
      ],
    }).compile();
    await moduleRef.init();
    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
    accounts = moduleRef.get(ACCOUNT_REPOSITORY);
    investments = moduleRef.get(INVESTMENT_REPOSITORY);
    movements = moduleRef.get(INVESTMENT_MOVEMENT_REPOSITORY);
    recurrences = moduleRef.get(RECURRENCE_REPOSITORY);
    transactions = moduleRef.get(TRANSACTION_MANAGER);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "investment_movements", "recurrences", "investments", "accounts", "users" RESTART IDENTITY CASCADE',
    );
  });

  async function fixture(startDate = today) {
    const users = dataSource.getRepository(UserOrmEntity);

    const { id: ownerId } = await users.save(
      users.create({
        name: 'Owner',
        email: `${randomUUID()}@example.com`,
        password: 'hash',
      }),
    );

    const account = await accounts.create(
      AccountEntity.create({
        uuid: randomUUID(),
        ownerId,
        name: 'Bank',
        type: AccountType.CHECKING,
        openingBalance: 100000,
        openingBalanceDate: addMonthsToDate(today, -3),
        isDefault: false,
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

    const recurrence = await moduleRef.get(CreateRecurrenceUseCase).execute({
      ownerId,
      type: RecurrenceType.INVESTMENT_CONTRIBUTION,
      description: 'Reserve',
      amount: 10000,
      frequency: RecurrenceFrequency.MONTHLY,
      startDate,
      accountUuid: account.uuid,
      investmentUuid: investment.uuid,
    });

    return { ownerId, account, investment, recurrence };
  }

  async function occurrences(ctx: Awaited<ReturnType<typeof fixture>>) {
    return (
      await movements.findPaginatedMandatoryByRecurrence(
        ctx.ownerId,
        ctx.recurrence.id,
        0,
        50,
      )
    ).items;
  }

  async function archive(
    ctx: Awaited<ReturnType<typeof fixture>>,
    decision: PendingOperationsDecision,
  ) {
    await moduleRef.get(UpdateInvestmentStatusUseCase).execute({
      uuid: ctx.investment.uuid,
      ownerId: ctx.ownerId,
      status: RecordStatus.INACTIVE,
      pendingOperations: decision,
    });
  }

  async function resume(ctx: Awaited<ReturnType<typeof fixture>>) {
    return moduleRef.get(UpdateRecurrenceStateUseCase).execute({
      uuid: ctx.recurrence.uuid,
      ownerId: ctx.ownerId,
      state: RecurrenceState.ACTIVE,
    });
  }

  it.each([RecurrenceState.ACTIVE, RecurrenceState.PAUSED])(
    'blocks deletion for a %s recurrence without movements, then permits it after ending',
    async (state) => {
      const ctx = await fixture(addMonthsToDate(today, 20));

      if (state === RecurrenceState.PAUSED) {
        await moduleRef
          .get(UpdateRecurrenceStateUseCase)
          .execute({ uuid: ctx.recurrence.uuid, ownerId: ctx.ownerId, state });
      }

      expect(await occurrences(ctx)).toEqual([]);
      await expect(
        moduleRef
          .get(DeleteAccountUseCase)
          .execute({ uuid: ctx.account.uuid, ownerId: ctx.ownerId }),
      ).rejects.toThrow(AccountHasRecurrencesError);
      await expect(
        moduleRef
          .get(DeleteInvestmentUseCase)
          .execute({ uuid: ctx.investment.uuid, ownerId: ctx.ownerId }),
      ).rejects.toThrow(InvestmentHasRecurrencesError);
      await moduleRef
        .get(EndRecurrenceUseCase)
        .execute({ uuid: ctx.recurrence.uuid, ownerId: ctx.ownerId });
      await moduleRef
        .get(DeleteInvestmentUseCase)
        .execute({ uuid: ctx.investment.uuid, ownerId: ctx.ownerId });
      await moduleRef
        .get(DeleteAccountUseCase)
        .execute({ uuid: ctx.account.uuid, ownerId: ctx.ownerId });
      await expect(resume(ctx)).rejects.toThrow(RecurrenceEndedError);
    },
  );

  it('KEEP pauses without removing history, resume extends the horizon without duplicating or reviving canceled dates', async () => {
    const ctx = await fixture();
    const before = await occurrences(ctx);

    await transactions.runInTransaction(async () => {
      await movements.update(before[0].complete(today));
      await movements.update(before[1].cancel());
    });
    await archive(ctx, PendingOperationsDecision.KEEP);

    const paused = await recurrences.findByUuidForOwner(
      ctx.recurrence.uuid,
      ctx.ownerId,
    );

    expect(paused).toMatchObject({
      state: RecurrenceState.PAUSED,
      generatedThrough: addDaysToDate(today, -1),
    });
    expect(await occurrences(ctx)).toHaveLength(before.length);
    await expect(resume(ctx)).rejects.toThrow(InactiveInvestmentError);
    expect(
      (await recurrences.findByUuidForOwner(ctx.recurrence.uuid, ctx.ownerId))
        ?.state,
    ).toBe(RecurrenceState.PAUSED);
    await moduleRef.get(UpdateInvestmentStatusUseCase).execute({
      uuid: ctx.investment.uuid,
      ownerId: ctx.ownerId,
      status: RecordStatus.ACTIVE,
    });
    expect(
      (await recurrences.findByUuidForOwner(ctx.recurrence.uuid, ctx.ownerId))
        ?.state,
    ).toBe(RecurrenceState.PAUSED);
    await resume(ctx);
    await transactions.runInTransaction(async () => {
      await moduleRef.get(RecurrenceReferences).lockOwnerFinances(ctx.ownerId);

      const current = await moduleRef
        .get(RecurrenceReferences)
        .lockRecurrence(ctx.recurrence.uuid, ctx.ownerId);

      await moduleRef
        .get(RecurrenceOccurrenceGenerator)
        .generate(current, addMonthsToDate(today, 3));
    });
    const after = await occurrences(ctx);

    expect(after.length).toBeGreaterThan(before.length);
    expect(after.find((m) => m.uuid === before[0].uuid)?.state).toBe(
      TransactionState.COMPLETED,
    );
    expect(after.find((m) => m.uuid === before[1].uuid)?.state).toBe(
      TransactionState.CANCELED,
    );
    expect(new Set(after.map((m) => m.recurrence?.occurrenceDate)).size).toBe(
      after.length,
    );
    expect(
      (await recurrences.findByUuidForOwner(ctx.recurrence.uuid, ctx.ownerId))!
        .generatedThrough! > ctx.recurrence.generatedThrough!,
    ).toBe(true);
  });

  it('CANCEL ends active and paused recurrences, keeps completed/canceled history, and never restarts after reactivation', async () => {
    const ctx = await fixture();
    const before = await occurrences(ctx);

    await movements.update(before[0].complete(today));
    await movements.update(before[1].cancel());
    const future = await fixture(addMonthsToDate(today, 20));

    await moduleRef.get(UpdateRecurrenceStateUseCase).execute({
      uuid: future.recurrence.uuid,
      ownerId: future.ownerId,
      state: RecurrenceState.PAUSED,
    });
    await archive(future, PendingOperationsDecision.CANCEL);
    expect(
      (
        await recurrences.findByUuidForOwner(
          future.recurrence.uuid,
          future.ownerId,
        )
      )?.state,
    ).toBe(RecurrenceState.ENDED);
    await archive(ctx, PendingOperationsDecision.CANCEL);
    expect(
      (await recurrences.findByUuidForOwner(ctx.recurrence.uuid, ctx.ownerId))
        ?.state,
    ).toBe(RecurrenceState.ENDED);
    const canceled = await occurrences(ctx);

    expect(canceled[0].state).toBe(TransactionState.COMPLETED);
    expect(
      canceled.slice(1).every((m) => m.state === TransactionState.CANCELED),
    ).toBe(true);
    await moduleRef.get(UpdateInvestmentStatusUseCase).execute({
      uuid: ctx.investment.uuid,
      ownerId: ctx.ownerId,
      status: RecordStatus.ACTIVE,
    });
    await expect(resume(ctx)).rejects.toThrow(RecurrenceEndedError);
    expect((await occurrences(ctx)).map((m) => [m.uuid, m.state])).toEqual(
      canceled.map((m) => [m.uuid, m.state]),
    );
  });

  it('rejects resume on an inactive or legacy deleted source before changing the paused state', async () => {
    const ctx = await fixture(addMonthsToDate(today, 20));

    await moduleRef.get(UpdateRecurrenceStateUseCase).execute({
      uuid: ctx.recurrence.uuid,
      ownerId: ctx.ownerId,
      state: RecurrenceState.PAUSED,
    });
    await accounts.update(ctx.account.withStatus(RecordStatus.INACTIVE));
    await expect(resume(ctx)).rejects.toThrow(InactiveAccountError);
    expect(
      (await recurrences.findByUuidForOwner(ctx.recurrence.uuid, ctx.ownerId))
        ?.state,
    ).toBe(RecurrenceState.PAUSED);
    await accounts.softDelete(ctx.account);
    await expect(resume(ctx)).rejects.toThrow();
    expect(
      (await recurrences.findByUuidForOwner(ctx.recurrence.uuid, ctx.ownerId))
        ?.state,
    ).toBe(RecurrenceState.PAUSED);
    expect(await occurrences(ctx)).toEqual([]);
  });
});
