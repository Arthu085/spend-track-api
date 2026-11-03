import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TransactionState } from '@modules/transactions';
import { PaginatedResult } from '@shared/application/dto';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import type { Translate } from '@shared/presentation/decorators';
import { PaginationQueryDto } from '@shared/presentation/dto';
import type { AuthenticatedUser } from '@shared/presentation/http';
import { buildAccount } from '@test/support/builders/account.builder';
import {
  buildInvestment,
  buildInvestmentMovement,
} from '@test/support/builders/investment.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import type { CreateInvestmentMovementUseCase } from '../../../application/use-cases/create-investment-movement.use-case';
import type { CreateInvestmentValuationUseCase } from '../../../application/use-cases/create-investment-valuation.use-case';
import type { CreateInvestmentUseCase } from '../../../application/use-cases/create-investment.use-case';
import type { DeleteInvestmentUseCase } from '../../../application/use-cases/delete-investment.use-case';
import type { GetInvestmentUseCase } from '../../../application/use-cases/get-investment.use-case';
import type { ListInvestmentMovementsUseCase } from '../../../application/use-cases/list-investment-movements.use-case';
import type { ListInvestmentsUseCase } from '../../../application/use-cases/list-investments.use-case';
import type { UpdateInvestmentMovementStateUseCase } from '../../../application/use-cases/update-investment-movement-state.use-case';
import type { UpdateInvestmentStatusUseCase } from '../../../application/use-cases/update-investment-status.use-case';
import type { UpdateInvestmentUseCase } from '../../../application/use-cases/update-investment.use-case';
import { InvestmentMovementType } from '../../../domain/enums/investment-movement-type.enum';
import { InvestmentType } from '../../../domain/enums/investment-type.enum';
import { CreateInvestmentMovementDto } from '../../dto/input/create-investment-movement.dto';
import { CreateInvestmentValuationDto } from '../../dto/input/create-investment-valuation.dto';
import { CreateInvestmentDto } from '../../dto/input/create-investment.dto';
import { UpdateInvestmentDto } from '../../dto/input/update-investment.dto';
import { InvestmentMovementsController } from '../investment-movements.controller';
import { InvestmentsController } from '../investments.controller';

const translate: Translate = (key) => `t:${key}`;

const actor: AuthenticatedUser = {
  id: 41,
  uuid: 'actor-uuid',
  email: 'actor@example.com',
  name: 'Actor',
  roles: ['ADMIN'],
};

const withValue = {
  investment: buildInvestment({
    type: InvestmentType.GOAL,
    targetAmount: 1000000,
  }),
  value: { current: 250050, contributed: 250000, withdrawn: 0, adjusted: 50 },
};

async function errorsOf<T extends object>(
  type: new () => T,
  body: object,
): Promise<string[]> {
  const errors = await validate(plainToInstance(type, body));

  return errors.map((error) => error.property);
}

describe('InvestmentsController', () => {
  const execute = jest.fn().mockResolvedValue(withValue);

  const controller = new InvestmentsController(
    mockOf<ListInvestmentsUseCase>({
      execute: jest
        .fn()
        .mockResolvedValue(PaginatedResult.of([withValue], 1, 1, 20)),
    }),
    mockOf<GetInvestmentUseCase>({ execute }),
    mockOf<CreateInvestmentUseCase>({ execute }),
    mockOf<UpdateInvestmentUseCase>({ execute }),
    mockOf<UpdateInvestmentStatusUseCase>({ execute }),
    mockOf<DeleteInvestmentUseCase>({ execute }),
  );

  beforeEach(() => execute.mockClear());

  it('serializes values, progress, and labels as decimal strings', async () => {
    const result = await controller.findOne('uuid', actor, translate);

    expect(execute).toHaveBeenCalledWith('uuid', 41);
    expect(result).toMatchObject({
      type: InvestmentType.GOAL,
      typeLabel: 't:investments.type.goal',
      targetAmount: '10000.00',
      currentValue: '2500.50',
      contributed: '2500.00',
      withdrawn: '0.00',
      adjusted: '0.50',
      progress: { remaining: '7499.50', percent: 25 },
      statusLabel: 't:enums.record_status.active',
    });
  });

  it('lists the caller investments with the query filters', async () => {
    const result = await controller.findAll(
      Object.assign(new PaginationQueryDto(), {
        page: 1,
        limit: 20,
        type: InvestmentType.GOAL,
      }),
      actor,
      translate,
    );

    expect(result.items[0].currentValue).toBe('2500.50');
  });

  it('parses money on create and passes a missing target as null', async () => {
    await controller.create(
      { name: 'Trip', type: InvestmentType.GOAL, targetAmount: '5000.10' },
      actor,
      translate,
    );
    await controller.create(
      { name: 'Stocks', type: InvestmentType.INVESTMENT },
      actor,
      translate,
    );

    expect(execute).toHaveBeenNthCalledWith(1, {
      ownerId: 41,
      name: 'Trip',
      type: InvestmentType.GOAL,
      targetAmount: 500010,
    });
    expect(execute).toHaveBeenNthCalledWith(2, {
      ownerId: 41,
      name: 'Stocks',
      type: InvestmentType.INVESTMENT,
      targetAmount: null,
    });
  });

  it('distinguishes an unsent target from a cleared one on update', async () => {
    await controller.update('uuid', { name: 'New' }, actor, translate);
    await controller.update('uuid', { targetAmount: null }, actor, translate);

    expect(execute).toHaveBeenNthCalledWith(1, {
      uuid: 'uuid',
      ownerId: 41,
      name: 'New',
      type: undefined,
      targetAmount: undefined,
    });
    expect(execute).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ targetAmount: null }),
    );
  });

  it('changes the status and deletes for the caller only', async () => {
    await controller.updateStatus(
      'uuid',
      { status: RecordStatus.INACTIVE },
      actor,
      translate,
    );
    await controller.remove('uuid', actor);

    expect(execute).toHaveBeenNthCalledWith(1, {
      uuid: 'uuid',
      ownerId: 41,
      status: RecordStatus.INACTIVE,
    });
    expect(execute).toHaveBeenNthCalledWith(2, { uuid: 'uuid', ownerId: 41 });
  });

  it('validates the investment payloads', async () => {
    await expect(
      errorsOf(CreateInvestmentDto, {
        name: ' ',
        type: 'STOCKS',
        targetAmount: '0.00',
      }),
    ).resolves.toEqual(['name', 'type', 'targetAmount']);
    await expect(
      errorsOf(CreateInvestmentDto, {
        name: 'Trip',
        type: InvestmentType.GOAL,
        targetAmount: null,
      }),
    ).resolves.toEqual([]);
    await expect(
      errorsOf(UpdateInvestmentDto, { targetAmount: null }),
    ).resolves.toEqual([]);
  });
});

describe('InvestmentMovementsController', () => {
  const movement = buildInvestmentMovement({
    account: buildAccount({ uuid: 'acc', name: 'Bank' }),
  });

  const execute = jest.fn().mockResolvedValue(movement);

  const controller = new InvestmentMovementsController(
    mockOf<ListInvestmentMovementsUseCase>({
      execute: jest.fn().mockResolvedValue(
        PaginatedResult.of(
          [
            movement,
            buildInvestmentMovement({
              type: InvestmentMovementType.VALUATION,
              account: null,
              amount: -1250,
            }),
          ],
          2,
          1,
          20,
        ),
      ),
    }),
    mockOf<CreateInvestmentMovementUseCase>({ execute }),
    mockOf<CreateInvestmentValuationUseCase>({ execute }),
    mockOf<UpdateInvestmentMovementStateUseCase>({ execute }),
  );

  beforeEach(() => execute.mockClear());

  it('serializes movements with signed valuation amounts and no account', async () => {
    const result = await controller.findAll(
      'uuid',
      Object.assign(new PaginationQueryDto(), { page: 1, limit: 20 }),
      actor,
      translate,
    );

    expect(result.items[0]).toMatchObject({
      type: InvestmentMovementType.CONTRIBUTION,
      typeLabel: 't:investments.movement_type.contribution',
      amount: '100.00',
      stateLabel: 't:transactions.state.completed',
      account: { uuid: 'acc', name: 'Bank' },
    });
    expect(result.items[1]).toMatchObject({
      type: InvestmentMovementType.VALUATION,
      amount: '-12.50',
      account: null,
    });
  });

  it('passes parsed contributions, valuations, and state changes to the use-cases', async () => {
    await controller.create(
      'uuid',
      {
        type: InvestmentMovementType.CONTRIBUTION,
        accountUuid: 'acc',
        amount: '100.00',
        date: '2026-11-05',
        state: TransactionState.PLANNED,
      },
      actor,
      translate,
    );
    await controller.valuate('uuid', { value: '0.00' }, actor, translate);
    await controller.updateState(
      'uuid',
      'movement',
      { state: TransactionState.COMPLETED, completedOn: '2026-11-06' },
      actor,
      translate,
    );

    expect(execute).toHaveBeenNthCalledWith(1, {
      investmentUuid: 'uuid',
      ownerId: 41,
      type: InvestmentMovementType.CONTRIBUTION,
      accountUuid: 'acc',
      amount: 10000,
      date: '2026-11-05',
      state: TransactionState.PLANNED,
      completedOn: undefined,
    });
    expect(execute).toHaveBeenNthCalledWith(2, {
      investmentUuid: 'uuid',
      ownerId: 41,
      value: 0,
      date: undefined,
    });
    expect(execute).toHaveBeenNthCalledWith(3, {
      investmentUuid: 'uuid',
      movementUuid: 'movement',
      ownerId: 41,
      state: TransactionState.COMPLETED,
      completedOn: '2026-11-06',
    });
  });

  it('validates the movement payloads', async () => {
    await expect(
      errorsOf(CreateInvestmentMovementDto, {
        type: InvestmentMovementType.VALUATION,
        accountUuid: 'nope',
        amount: '0',
        date: '2026-13-01',
        state: TransactionState.PLANNED,
        completedOn: '2026-11-01',
      }),
    ).resolves.toEqual([
      'type',
      'accountUuid',
      'amount',
      'date',
      'completedOn',
    ]);
    await expect(
      errorsOf(CreateInvestmentValuationDto, { value: '-1.00' }),
    ).resolves.toEqual(['value']);
    await expect(
      errorsOf(CreateInvestmentValuationDto, { value: '0', date: null }),
    ).resolves.toEqual([]);
  });
});
