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
import { TransactionState } from '@modules/transactions';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { InvestmentMovementEntity } from '../../../../domain/entities/investment-movement.entity';
import { InvestmentEntity } from '../../../../domain/entities/investment.entity';
import { InvestmentMovementType } from '../../../../domain/enums/investment-movement-type.enum';
import { InvestmentType } from '../../../../domain/enums/investment-type.enum';
import { InvestmentMovementOrmEntity } from '../../entities/investment-movement.orm-entity';
import { InvestmentOrmEntity } from '../../entities/investment.orm-entity';
import { TypeOrmInvestmentMovementRepository } from '../typeorm-investment-movement.repository';
import { TypeOrmInvestmentRepository } from '../typeorm-investment.repository';

describe('investment repositories (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let investments: TypeOrmInvestmentRepository;
  let movements: TypeOrmInvestmentMovementRepository;
  let accounts: TypeOrmAccountRepository;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        CoreConfigModule,
        DatabaseModule,
        TypeOrmModule.forFeature([
          InvestmentOrmEntity,
          InvestmentMovementOrmEntity,
          AccountOrmEntity,
          UserOrmEntity,
        ]),
      ],
      providers: [
        TypeOrmInvestmentRepository,
        TypeOrmInvestmentMovementRepository,
        TypeOrmAccountRepository,
      ],
    }).compile();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
    investments = moduleRef.get(TypeOrmInvestmentRepository);
    movements = moduleRef.get(TypeOrmInvestmentMovementRepository);
    accounts = moduleRef.get(TypeOrmAccountRepository);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "investment_movements", "investments", "accounts", "users" RESTART IDENTITY CASCADE',
    );
  });

  async function insertUser(): Promise<number> {
    const users = dataSource.getRepository(UserOrmEntity);

    const user = await users.save(
      users.create({
        name: 'Owner',
        email: `${randomUUID()}@example.com`,
        password: 'hash',
      }),
    );

    return user.id;
  }

  function createInvestment(
    ownerId: number,
    name: string,
    type = InvestmentType.RESERVE,
  ): Promise<InvestmentEntity> {
    return investments.create(
      InvestmentEntity.create({
        uuid: randomUUID(),
        ownerId,
        name,
        type,
        targetAmount: 1000000,
      }),
    );
  }

  function createAccount(ownerId: number): Promise<AccountEntity> {
    return accounts.create(
      AccountEntity.create({
        uuid: randomUUID(),
        ownerId,
        name: 'Bank',
        type: AccountType.CHECKING,
        openingBalance: 0,
        openingBalanceDate: '2026-10-01',
        isDefault: false,
      }),
    );
  }

  function transfer(
    investment: InvestmentEntity,
    account: AccountEntity,
    type:
      | InvestmentMovementType.CONTRIBUTION
      | InvestmentMovementType.WITHDRAWAL,
    amount: number,
    date: string,
    state: TransactionState.PLANNED | TransactionState.COMPLETED,
  ): Promise<InvestmentMovementEntity> {
    return movements.create(
      InvestmentMovementEntity.createTransfer({
        uuid: randomUUID(),
        ownerId: investment.ownerId,
        investmentId: investment.id,
        type,
        account,
        amount,
        date,
        state,
        completedOn: null,
      }),
    );
  }

  it("lists and finds only the owner's investments, by name, with filters", async () => {
    const ownerId = await insertUser();
    const otherId = await insertUser();
    const reserve = await createInvestment(ownerId, 'Reserve');
    await createInvestment(ownerId, 'Japan', InvestmentType.GOAL);
    await createInvestment(otherId, 'Foreign');

    const archived = await investments.update(
      reserve.withStatus(RecordStatus.INACTIVE),
    );

    const page = await investments.findAllPaginatedByOwner(ownerId, 0, 10, {
      status: RecordStatus.ACTIVE,
    });

    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({
      name: 'Japan',
      type: InvestmentType.GOAL,
      targetAmount: 1000000,
    });
    expect(
      (await investments.findAllByOwner(ownerId)).map(({ name }) => name),
    ).toEqual(['Japan', 'Reserve']);
    expect(
      await investments.findAllByOwner(ownerId, { type: InvestmentType.GOAL }),
    ).toHaveLength(1);
    expect(archived.status).toBe(RecordStatus.INACTIVE);
    await expect(
      investments.findByUuidForOwner(reserve.uuid, otherId),
    ).resolves.toBeNull();

    await investments.softDelete(archived);

    await expect(
      investments.findByUuidForOwner(reserve.uuid, ownerId),
    ).resolves.toBeNull();
  });

  it('sums completed movements per investment and per account, and planned ones until a date', async () => {
    const ownerId = await insertUser();
    const reserve = await createInvestment(ownerId, 'Reserve');
    const empty = await createInvestment(ownerId, 'Empty');
    const bank = await createAccount(ownerId);

    await transfer(
      reserve,
      bank,
      InvestmentMovementType.CONTRIBUTION,
      100000,
      '2026-10-05',
      TransactionState.COMPLETED,
    );
    await transfer(
      reserve,
      bank,
      InvestmentMovementType.WITHDRAWAL,
      25000,
      '2026-10-20',
      TransactionState.COMPLETED,
    );
    await transfer(
      reserve,
      bank,
      InvestmentMovementType.CONTRIBUTION,
      7000,
      '2026-11-10',
      TransactionState.PLANNED,
    );
    await transfer(
      reserve,
      bank,
      InvestmentMovementType.CONTRIBUTION,
      9000,
      '2026-12-10',
      TransactionState.PLANNED,
    );

    const canceled = await transfer(
      reserve,
      bank,
      InvestmentMovementType.CONTRIBUTION,
      50000,
      '2026-10-25',
      TransactionState.COMPLETED,
    );

    await movements.update(canceled.cancel());

    await movements.create(
      InvestmentMovementEntity.createValuation({
        uuid: randomUUID(),
        ownerId,
        investmentId: reserve.id,
        change: -1234,
        date: '2026-10-31',
      }),
    );

    const totals = await movements.sumTotalsByInvestment(ownerId, [
      reserve.id,
      empty.id,
    ]);

    expect(totals.get(reserve.id)).toEqual({
      contributed: 100000,
      withdrawn: 25000,
      adjusted: -1234,
    });
    expect(totals.has(empty.id)).toBe(false);

    await expect(
      movements.sumAccountChanges(ownerId, [bank.id], {
        state: TransactionState.COMPLETED,
      }),
    ).resolves.toEqual(new Map([[bank.id, -75000]]));
    await expect(
      movements.sumAccountChanges(ownerId, [bank.id], {
        state: TransactionState.PLANNED,
        until: '2026-11-30',
      }),
    ).resolves.toEqual(new Map([[bank.id, -7000]]));

    await expect(
      movements.sumByTypeAndState(ownerId, {
        from: '2026-10-01',
        to: '2026-10-31',
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        {
          type: InvestmentMovementType.CONTRIBUTION,
          state: TransactionState.COMPLETED,
          total: 100000,
        },
        {
          type: InvestmentMovementType.WITHDRAWAL,
          state: TransactionState.COMPLETED,
          total: 25000,
        },
      ]),
    );

    await expect(movements.existsForAccount(ownerId, bank.id)).resolves.toBe(
      true,
    );
    await expect(
      movements.existsForInvestment(ownerId, empty.id),
    ).resolves.toBe(false);

    const page = await movements.findPaginatedByInvestment(
      ownerId,
      reserve.id,
      0,
      3,
    );

    expect(page.total).toBe(6);
    expect(page.items.map(({ date }) => date)).toEqual([
      '2026-12-10',
      '2026-11-10',
      '2026-10-31',
    ]);
    expect(page.items[2].account).toBeNull();
    expect(page.items[1].account?.uuid).toBe(bank.uuid);
  });

  it('finds a movement only inside its investment', async () => {
    const ownerId = await insertUser();
    const reserve = await createInvestment(ownerId, 'Reserve');
    const other = await createInvestment(ownerId, 'Other');
    const bank = await createAccount(ownerId);

    const movement = await transfer(
      reserve,
      bank,
      InvestmentMovementType.CONTRIBUTION,
      100,
      '2026-10-05',
      TransactionState.PLANNED,
    );

    await expect(
      movements.findByUuidForInvestment(movement.uuid, reserve.id),
    ).resolves.toMatchObject({ uuid: movement.uuid });
    await expect(
      movements.findByUuidForInvestment(movement.uuid, other.id),
    ).resolves.toBeNull();
  });

  it('enforces the movement shape in PostgreSQL', async () => {
    const ownerId = await insertUser();
    const reserve = await createInvestment(ownerId, 'Reserve');

    await expect(
      dataSource.query(
        `INSERT INTO "investment_movements" ("user_id", "investment_id", "type", "amount", "date", "state", "completed_on")
         VALUES ($1, $2, 'CONTRIBUTION', 10, '2026-10-01', 'COMPLETED', '2026-10-01')`,
        [ownerId, reserve.id],
      ),
    ).rejects.toThrow(QueryFailedError);
    await expect(
      dataSource.query(
        `INSERT INTO "investment_movements" ("user_id", "investment_id", "type", "amount", "date", "state")
         VALUES ($1, $2, 'VALUATION', 10, '2026-10-01', 'PLANNED')`,
        [ownerId, reserve.id],
      ),
    ).rejects.toThrow(QueryFailedError);
  });
});
