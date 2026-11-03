import { TransactionState } from '@modules/transactions';
import { PaginatedResult } from '@shared/application/dto';
import type { Translate } from '@shared/presentation/decorators';
import type { AuthenticatedUser } from '@shared/presentation/http';
import { buildCreditCard } from '@test/support/builders/credit-card.builder';
import { buildRecurrence } from '@test/support/builders/recurrence.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import type { RecurrenceOccurrence } from '../../../application/services/recurrence-occurrence';
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
import { RecurrenceFrequency } from '../../../domain/enums/recurrence-frequency.enum';
import { RecurrenceState } from '../../../domain/enums/recurrence-state.enum';
import { RecurrenceType } from '../../../domain/enums/recurrence-type.enum';
import { RecurrenceUpdateScope } from '../../../domain/enums/recurrence-update-scope.enum';
import { ListRecurrenceOccurrencesQueryDto } from '../../dto/input/list-recurrence-occurrences-query.dto';
import { ListRecurrencesQueryDto } from '../../dto/input/list-recurrences-query.dto';
import { RecurrenceOccurrencesController } from '../recurrence-occurrences.controller';
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
