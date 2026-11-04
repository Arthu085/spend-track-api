import { Logger } from '@nestjs/common';
import type { AccountRepository } from '@modules/accounts';
import {
  InactiveCreditCardError,
  type CreateCreditCardPurchaseUseCase,
  type CreditCardInvoiceAssigner,
  type CreditCardRepository,
} from '@modules/credit-cards';
import type { TransactionCategoryRepository } from '@modules/transaction-categories';
import {
  OccurrenceAfterRecurrenceEndError,
  TransactionState,
  TransactionType,
  type TransactionEntity,
  type TransactionRepository,
} from '@modules/transactions';
import type { TransactionManagerPort } from '@shared/application/ports';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { buildAccount } from '@test/support/builders/account.builder';
import {
  buildCreditCard,
  buildCreditCardInvoice,
  buildCreditCardPurchase,
} from '@test/support/builders/credit-card.builder';
import {
  buildRecurrence,
  buildRecurrenceCardCharge,
} from '@test/support/builders/recurrence.builder';
import { buildTransactionCategory } from '@test/support/builders/transaction-category.builder';
import { buildTransaction } from '@test/support/builders/transaction.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import type { RecurrenceCardChargeEntity } from '../../../domain/entities/recurrence-card-charge.entity';
import type { RecurrenceEntity } from '../../../domain/entities/recurrence.entity';
import { RecurrenceFrequency } from '../../../domain/enums/recurrence-frequency.enum';
import { RecurrenceState } from '../../../domain/enums/recurrence-state.enum';
import { RecurrenceType } from '../../../domain/enums/recurrence-type.enum';
import { RecurrenceUpdateScope } from '../../../domain/enums/recurrence-update-scope.enum';
import { RecurrenceEndedError } from '../../../domain/errors/recurrence-ended.error';
import { RecurrenceInvoiceEndNotApplicableError } from '../../../domain/errors/recurrence-invoice-end-not-applicable.error';
import { RecurrenceNotFoundError } from '../../../domain/errors/recurrence-not-found.error';
import { RecurrenceOccurrenceNotFoundError } from '../../../domain/errors/recurrence-occurrence-not-found.error';
import { RecurrenceOccurrenceNotPlannedError } from '../../../domain/errors/recurrence-occurrence-not-planned.error';
import type { RecurrenceCardChargeRepository } from '../../../domain/repositories/recurrence-card-charge.repository';
import type { RecurrenceRepository } from '../../../domain/repositories/recurrence.repository';
import { RecurrenceOccurrenceGenerator } from '../../services/recurrence-occurrence-generator';
import { RecurrenceOccurrences } from '../../services/recurrence-occurrences';
import { RecurrenceReferences } from '../../services/recurrence-references';
import { CancelRecurrenceOccurrenceUseCase } from '../cancel-recurrence-occurrence.use-case';
import { ConfirmRecurrenceOccurrenceUseCase } from '../confirm-recurrence-occurrence.use-case';
import { CreateRecurrenceUseCase } from '../create-recurrence.use-case';
import { EndRecurrenceUseCase } from '../end-recurrence.use-case';
import { GenerateDueRecurrenceOccurrencesUseCase } from '../generate-due-recurrence-occurrences.use-case';
import { UpdateRecurrenceOccurrenceUseCase } from '../update-recurrence-occurrence.use-case';
import { UpdateRecurrenceStateUseCase } from '../update-recurrence-state.use-case';
import { UpdateRecurrenceUseCase } from '../update-recurrence.use-case';

const transactionManager: TransactionManagerPort = {
  runInTransaction: <T>(work: () => Promise<T>): Promise<T> => work(),
  runInSavepoint: <T>(work: () => Promise<T>): Promise<T> => work(),
};

const account = buildAccount({ id: 3, uuid: 'account' });
const card = buildCreditCard({ id: 4, uuid: 'card' });
const category = buildTransactionCategory({ id: 5, uuid: 'category' });

const cardRecurrence = (
  overrides: Parameters<typeof buildRecurrence>[0] = {},
) =>
  buildRecurrence({
    description: 'Netflix',
    amount: 5590,
    account: null,
    creditCard: card,
    ...overrides,
  });

function setup(stored: RecurrenceEntity | null = buildRecurrence()) {
  const calls: string[] = [];

  const recurrences = {
    findByUuidForOwner: jest.fn().mockResolvedValue(stored),
    findByUuidForOwnerForUpdate: jest.fn().mockResolvedValue(stored),
    findDueForGeneration: jest.fn().mockResolvedValue([]),
    create: jest.fn((recurrence: RecurrenceEntity) =>
      Promise.resolve(recurrence),
    ),
    update: jest.fn((recurrence: RecurrenceEntity) =>
      Promise.resolve(recurrence),
    ),
  };

  const charges = {
    findPlannedByRecurrence: jest.fn().mockResolvedValue([]),
    findPlannedByCard: jest.fn().mockResolvedValue([]),
    findOccurrenceDatesFrom: jest.fn().mockResolvedValue([]),
    findByUuidForRecurrence: jest.fn().mockResolvedValue(null),
    create: jest.fn((charge: RecurrenceCardChargeEntity) =>
      Promise.resolve(charge),
    ),
    update: jest.fn((charge: RecurrenceCardChargeEntity) =>
      Promise.resolve(charge),
    ),
    softDelete: jest.fn().mockResolvedValue(undefined),
  };

  const transactions = {
    findPlannedByRecurrence: jest.fn().mockResolvedValue([]),
    findRecurrenceDatesFrom: jest.fn().mockResolvedValue([]),
    findByUuidForOwnerForUpdate: jest.fn().mockResolvedValue(null),
    create: jest.fn((transaction: TransactionEntity) =>
      Promise.resolve(transaction),
    ),
    update: jest.fn((transaction: TransactionEntity) =>
      Promise.resolve(transaction),
    ),
    softDelete: jest.fn().mockResolvedValue(undefined),
  };

  const assigner = {
    referenceMonthFor: jest.fn((_: unknown, date: string) =>
      Promise.resolve(`${date.slice(0, 7)}-01`),
    ),
    lastDateBefore: jest.fn().mockResolvedValue('2026-11-04'),
  };

  const createPurchase = { recordPlannedCharge: jest.fn() };

  const accountRepository = mockOf<AccountRepository>({
    lockOwnerAccounts: jest.fn(() => {
      calls.push('lock-accounts');

      return Promise.resolve();
    }),
    findByUuidForOwner: jest.fn((uuid: string) =>
      Promise.resolve(uuid === account.uuid ? account : null),
    ),
  });

  const cardRepository = mockOf<CreditCardRepository>({
    lockOwnerCards: jest.fn(() => {
      calls.push('lock-cards');

      return Promise.resolve();
    }),
    findByUuidForOwner: jest.fn((uuid: string) =>
      Promise.resolve(
        uuid === card.uuid
          ? card
          : uuid === 'archived'
            ? buildCreditCard({ status: RecordStatus.INACTIVE })
            : null,
      ),
    ),
  });

  const references = new RecurrenceReferences(
    mockOf<RecurrenceRepository>(recurrences),
    accountRepository,
    cardRepository,
    mockOf<TransactionCategoryRepository>({
      findVisibleByUuid: jest.fn().mockResolvedValue(category),
    }),
  );

  const invoiceAssigner = mockOf<CreditCardInvoiceAssigner>(assigner);

  const occurrences = new RecurrenceOccurrences(
    mockOf<TransactionRepository>(transactions),
    mockOf<RecurrenceCardChargeRepository>(charges),
    invoiceAssigner,
  );

  const generator = new RecurrenceOccurrenceGenerator(
    mockOf<RecurrenceRepository>(recurrences),
    mockOf<RecurrenceCardChargeRepository>(charges),
    mockOf<TransactionRepository>(transactions),
    invoiceAssigner,
  );

  const recurrenceRepository = mockOf<RecurrenceRepository>(recurrences);

  return {
    calls,
    recurrences,
    charges,
    transactions,
    assigner,
    createPurchase,
    create: new CreateRecurrenceUseCase(
      recurrenceRepository,
      transactionManager,
      references,
      generator,
    ),
    update: new UpdateRecurrenceUseCase(
      recurrenceRepository,
      transactionManager,
      references,
      occurrences,
    ),
    updateState: new UpdateRecurrenceStateUseCase(
      recurrenceRepository,
      transactionManager,
      references,
      occurrences,
      generator,
    ),
    end: new EndRecurrenceUseCase(
      recurrenceRepository,
      transactionManager,
      references,
      occurrences,
      generator,
      invoiceAssigner,
    ),
    updateOccurrence: new UpdateRecurrenceOccurrenceUseCase(
      transactionManager,
      references,
      occurrences,
    ),
    confirm: new ConfirmRecurrenceOccurrenceUseCase(
      mockOf<TransactionRepository>(transactions),
      mockOf<RecurrenceCardChargeRepository>(charges),
      transactionManager,
      references,
      occurrences,
      mockOf<CreateCreditCardPurchaseUseCase>(createPurchase),
    ),
    cancel: new CancelRecurrenceOccurrenceUseCase(
      transactionManager,
      references,
      occurrences,
    ),
    generateDue: new GenerateDueRecurrenceOccurrencesUseCase(
      recurrenceRepository,
      transactionManager,
      references,
      generator,
    ),
  };
}

const createdTransactions = (
  transactions: ReturnType<typeof setup>['transactions'],
): TransactionEntity[] =>
  transactions.create.mock.calls.map(([transaction]) => transaction);

describe('recurrence use-cases', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-03T15:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('CreateRecurrenceUseCase', () => {
    it('generates planned transactions up to 12 months ahead under the owner locks', async () => {
      const { create, transactions, recurrences, calls } = setup();

      const recurrence = await create.execute({
        ownerId: 1,
        type: RecurrenceType.EXPENSE,
        description: 'Rent',
        amount: 150000,
        frequency: RecurrenceFrequency.MONTHLY,
        startDate: '2026-10-15',
        accountUuid: 'account',
        categoryUuid: 'category',
      });

      const generated = createdTransactions(transactions);

      expect(calls).toEqual(['lock-accounts', 'lock-cards']);
      expect(generated).toHaveLength(14);
      expect(generated[0]).toMatchObject({
        type: TransactionType.EXPENSE,
        state: TransactionState.PLANNED,
        amount: 150000,
        date: '2026-10-15',
        account,
        recurrence: { occurrenceDate: '2026-10-15' },
      });
      expect(generated.at(-1)?.date).toBe('2027-11-15');
      expect(recurrence.generatedThrough).toBe('2027-11-30');
      expect(recurrences.update).toHaveBeenCalledTimes(1);
    });

    it('generates planned card charges on their expected invoice months', async () => {
      const { create, charges, transactions, assigner } = setup();

      await create.execute({
        ownerId: 1,
        type: RecurrenceType.EXPENSE,
        description: 'Netflix',
        amount: 5590,
        frequency: RecurrenceFrequency.MONTHLY,
        startDate: '2026-11-15',
        endDate: '2027-01-15',
        creditCardUuid: 'card',
        categoryUuid: 'category',
      });

      expect(transactions.create).not.toHaveBeenCalled();
      expect(assigner.referenceMonthFor).toHaveBeenCalledWith(
        card,
        '2026-11-15',
      );
      expect(
        charges.create.mock.calls.map(([charge]) => [
          charge.occurrenceDate,
          charge.state,
          charge.invoiceMonth,
        ]),
      ).toEqual([
        ['2026-11-15', TransactionState.PLANNED, '2026-11-01'],
        ['2026-12-15', TransactionState.PLANNED, '2026-12-01'],
        ['2027-01-15', TransactionState.PLANNED, '2027-01-01'],
      ]);
    });

    it.each([
      ['an account', { accountUuid: 'account' }],
      ['a card', { creditCardUuid: 'card' }],
    ])(
      'generates nothing for %s recurrence whose end date already passed',
      async (_target, target) => {
        const { create, charges, transactions, recurrences } = setup();

        const recurrence = await create.execute({
          ownerId: 1,
          type: RecurrenceType.EXPENSE,
          description: 'Rent',
          amount: 150000,
          frequency: RecurrenceFrequency.MONTHLY,
          startDate: '2026-08-15',
          endDate: '2026-11-02',
          categoryUuid: 'category',
          ...target,
        });

        expect(recurrence.stateOn('2026-11-03')).toBe(RecurrenceState.ENDED);
        expect(recurrence.generatedThrough).toBeNull();
        expect(transactions.create).not.toHaveBeenCalled();
        expect(charges.create).not.toHaveBeenCalled();
        expect(recurrences.update).not.toHaveBeenCalled();
      },
    );

    it('rejects an archived card', async () => {
      const { create } = setup();

      await expect(
        create.execute({
          ownerId: 1,
          type: RecurrenceType.EXPENSE,
          description: 'Netflix',
          amount: 5590,
          frequency: RecurrenceFrequency.MONTHLY,
          startDate: '2026-11-15',
          creditCardUuid: 'archived',
          categoryUuid: 'category',
        }),
      ).rejects.toThrow(InactiveCreditCardError);
    });
  });

  describe('GenerateDueRecurrenceOccurrencesUseCase', () => {
    it('extends due recurrences without generating a date twice', async () => {
      const recurrence = buildRecurrence({
        account,
        generatedThrough: '2027-10-31',
      });

      const { generateDue, recurrences, transactions } = setup(recurrence);

      recurrences.findDueForGeneration.mockResolvedValue([
        { uuid: recurrence.uuid, ownerId: 1 },
      ]);

      await expect(generateDue.execute('2026-12-01')).resolves.toBe(1);

      expect(recurrences.findDueForGeneration).toHaveBeenCalledWith(
        '2027-12-31',
        '2026-12-01',
        500,
      );
      expect(createdTransactions(transactions).map(({ date }) => date)).toEqual(
        ['2027-11-15', '2027-12-15'],
      );

      const extended = recurrences.update.mock.calls[0][0];

      recurrences.findByUuidForOwnerForUpdate.mockResolvedValue(extended);
      transactions.create.mockClear();

      await generateDue.execute('2026-12-01');

      expect(transactions.create).not.toHaveBeenCalled();
    });

    it('logs a failing recurrence and still extends the ones after it', async () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      const { generateDue, recurrences } = setup();

      recurrences.findDueForGeneration.mockResolvedValue(
        ['a', 'bad', 'c'].map((uuid) => ({ uuid, ownerId: 1 })),
      );
      recurrences.findByUuidForOwnerForUpdate.mockImplementation(
        (uuid: string) =>
          uuid === 'bad'
            ? Promise.reject(new Error('boom'))
            : Promise.resolve(
                buildRecurrence({
                  uuid,
                  account,
                  generatedThrough: '2027-10-31',
                }),
              ),
      );

      await expect(generateDue.execute('2026-12-01')).resolves.toBe(2);

      expect(
        recurrences.update.mock.calls.map(([recurrence]) => recurrence.uuid),
      ).toEqual(['a', 'c']);
      expect(error).toHaveBeenCalledTimes(1);
      expect(error).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Recurrence occurrence generation failed',
          recurrenceUuid: 'bad',
        }),
      );

      error.mockRestore();
    });

    it.each([
      ['account', { account }],
      ['card', { account: null, creditCard: card }],
    ])(
      'generates nothing for a stored-active %s recurrence past its end date even if behind',
      async (_target, target) => {
        const recurrence = buildRecurrence({
          ...target,
          startDate: '2026-08-15',
          endDate: '2026-11-02',
          generatedThrough: '2026-08-31',
        });

        const { generateDue, recurrences, charges, transactions } =
          setup(recurrence);

        recurrences.findDueForGeneration.mockResolvedValue([
          { uuid: recurrence.uuid, ownerId: 1 },
        ]);

        await generateDue.execute('2026-11-03');

        expect(transactions.create).not.toHaveBeenCalled();
        expect(charges.create).not.toHaveBeenCalled();
        expect(recurrences.update).not.toHaveBeenCalled();
      },
    );

    it('still generates on the end date itself', async () => {
      const recurrence = buildRecurrence({
        account,
        startDate: '2026-08-15',
        endDate: '2026-11-03',
        generatedThrough: '2026-09-30',
      });

      const { generateDue, recurrences, transactions } = setup(recurrence);

      recurrences.findDueForGeneration.mockResolvedValue([
        { uuid: recurrence.uuid, ownerId: 1 },
      ]);

      await generateDue.execute('2026-11-03');

      expect(createdTransactions(transactions).map(({ date }) => date)).toEqual(
        ['2026-10-15'],
      );
    });

    it('skips recurrences whose account is archived', async () => {
      const recurrence = buildRecurrence({
        account: buildAccount({ status: RecordStatus.INACTIVE }),
      });

      const { generateDue, recurrences, transactions } = setup(recurrence);

      recurrences.findDueForGeneration.mockResolvedValue([
        { uuid: recurrence.uuid, ownerId: 1 },
      ]);

      await generateDue.execute();

      expect(transactions.create).not.toHaveBeenCalled();
      expect(recurrences.update).not.toHaveBeenCalled();
    });
  });

  describe('UpdateRecurrenceUseCase', () => {
    it('updates the template and the planned occurrences from the given date only', async () => {
      const planned = buildTransaction({
        uuid: 'planned',
        account,
        category,
        recurrence: {
          id: 1,
          uuid: 'recurrence-uuid',
          occurrenceDate: '2026-12-15',
          endDate: null,
        },
      });

      const { update, transactions } = setup(
        buildRecurrence({ account, category }),
      );

      transactions.findPlannedByRecurrence.mockResolvedValue([planned]);

      const updated = await update.execute({
        uuid: 'recurrence-uuid',
        ownerId: 1,
        scope: RecurrenceUpdateScope.FUTURE,
        from: '2026-12-01',
        amount: 160000,
      });

      expect(updated.amount).toBe(160000);
      expect(transactions.findPlannedByRecurrence).toHaveBeenCalledWith(
        1,
        1,
        '2026-12-01',
      );
      expect(transactions.update.mock.calls[0][0]).toMatchObject({
        uuid: 'planned',
        amount: 160000,
        date: planned.date,
      });
    });

    it('updates every planned occurrence with the ALL scope', async () => {
      const { update, charges } = setup(cardRecurrence());

      charges.findPlannedByRecurrence.mockResolvedValue([
        buildRecurrenceCardCharge(),
      ]);

      await update.execute({
        uuid: 'recurrence-uuid',
        ownerId: 1,
        scope: RecurrenceUpdateScope.ALL,
        description: 'Netflix Premium',
      });

      expect(charges.findPlannedByRecurrence).toHaveBeenCalledWith(
        1,
        undefined,
      );
      expect(charges.update.mock.calls[0][0].description).toBe(
        'Netflix Premium',
      );
    });

    it('refuses an ended recurrence and answers 404 for a foreign one', async () => {
      await expect(
        setup(buildRecurrence({ state: RecurrenceState.ENDED })).update.execute(
          {
            uuid: 'recurrence-uuid',
            ownerId: 1,
            scope: RecurrenceUpdateScope.ALL,
          },
        ),
      ).rejects.toThrow(RecurrenceEndedError);
      await expect(
        setup(null).update.execute({
          uuid: 'other',
          ownerId: 2,
          scope: RecurrenceUpdateScope.ALL,
        }),
      ).rejects.toThrow(RecurrenceNotFoundError);
    });
  });

  describe('UpdateRecurrenceStateUseCase', () => {
    it('removes planned occurrences from today when pausing', async () => {
      const { updateState, transactions } = setup(
        buildRecurrence({ generatedThrough: '2027-11-30' }),
      );

      const paused = await updateState.execute({
        uuid: 'recurrence-uuid',
        ownerId: 1,
        state: RecurrenceState.PAUSED,
      });

      expect(paused.state).toBe(RecurrenceState.PAUSED);
      expect(transactions.findPlannedByRecurrence).toHaveBeenCalledWith(
        1,
        1,
        '2026-11-03',
      );
    });

    it('generates again from today when resuming', async () => {
      const { updateState, transactions } = setup(
        buildRecurrence({
          state: RecurrenceState.PAUSED,
          generatedThrough: '2026-09-30',
        }),
      );

      await updateState.execute({
        uuid: 'recurrence-uuid',
        ownerId: 1,
        state: RecurrenceState.ACTIVE,
      });

      expect(createdTransactions(transactions)[0].date).toBe('2026-11-15');
    });
  });

  describe('EndRecurrenceUseCase', () => {
    it('ends a card recurrence from an invoice month, keeping earlier charges', async () => {
      const { end, charges, assigner } = setup(
        cardRecurrence({ generatedThrough: '2027-11-30' }),
      );

      const ended = await end.execute({
        uuid: 'recurrence-uuid',
        ownerId: 1,
        fromInvoiceMonth: '2026-12-01',
      });

      expect(assigner.lastDateBefore).toHaveBeenCalledWith(card, '2026-12-01');
      expect(ended.endDate).toBe('2026-11-04');
      expect(ended.stateOn('2026-11-03')).toBe(RecurrenceState.ACTIVE);
      expect(charges.findPlannedByRecurrence).toHaveBeenCalledWith(
        1,
        '2026-11-05',
      );
    });

    it.each([
      ['account', { account }],
      ['card', { account: null, creditCard: card }],
    ])(
      'keeps the planned %s occurrences up to today when ending the whole recurrence',
      async (_target, target) => {
        const { end, charges, transactions } = setup(
          buildRecurrence({ ...target, startDate: '2026-08-15' }),
        );

        const ended = await end.execute({
          uuid: 'recurrence-uuid',
          ownerId: 1,
        });

        expect(ended).toMatchObject({
          state: RecurrenceState.ENDED,
          endDate: '2026-11-03',
        });

        if (ended.isCardRecurrence) {
          expect(charges.findPlannedByRecurrence).toHaveBeenCalledWith(
            1,
            '2026-11-04',
          );
        } else {
          expect(transactions.findPlannedByRecurrence).toHaveBeenCalledWith(
            1,
            1,
            '2026-11-04',
          );
        }
      },
    );

    it('removes every planned occurrence with a cut on or before the start date', async () => {
      const { end, transactions } = setup(
        buildRecurrence({ account, startDate: '2026-08-15' }),
      );

      transactions.findPlannedByRecurrence.mockResolvedValue([
        buildTransaction({ uuid: 'a' }),
        buildTransaction({ uuid: 'b' }),
      ]);

      const ended = await end.execute({
        uuid: 'recurrence-uuid',
        ownerId: 1,
        from: '2026-08-15',
      });

      expect(ended).toMatchObject({
        state: RecurrenceState.ENDED,
        endDate: null,
      });
      expect(transactions.findPlannedByRecurrence).toHaveBeenCalledWith(
        1,
        1,
        '2026-08-15',
      );
      expect(transactions.softDelete).toHaveBeenCalledTimes(2);
    });

    it.each([
      ['account', { account }],
      ['card', { account: null, creditCard: card }],
    ])(
      'removes only the planned %s occurrences past the new end and generates no skipped date',
      async (_target, target) => {
        const recurrence = buildRecurrence({
          ...target,
          startDate: '2026-08-15',
          generatedThrough: '2026-08-31',
        });

        const { end, recurrences, charges, transactions } = setup(recurrence);

        const ended = await end.execute({
          uuid: 'recurrence-uuid',
          ownerId: 1,
          from: '2026-11-03',
        });

        expect(ended.endDate).toBe('2026-11-02');
        expect(ended.stateOn('2026-11-03')).toBe(RecurrenceState.ENDED);

        if (recurrence.isCardRecurrence) {
          expect(charges.findPlannedByRecurrence).toHaveBeenCalledWith(
            1,
            '2026-11-03',
          );
        } else {
          expect(transactions.findPlannedByRecurrence).toHaveBeenCalledWith(
            1,
            1,
            '2026-11-03',
          );
        }

        expect(transactions.create).not.toHaveBeenCalled();
        expect(charges.create).not.toHaveBeenCalled();
        expect(recurrences.update).toHaveBeenCalledTimes(1);
      },
    );

    it('rejects an invoice month on an account recurrence', async () => {
      await expect(
        setup().end.execute({
          uuid: 'recurrence-uuid',
          ownerId: 1,
          fromInvoiceMonth: '2026-12-01',
        }),
      ).rejects.toThrow(RecurrenceInvoiceEndNotApplicableError);
    });
  });

  describe('occurrence use-cases', () => {
    const occurrence = (
      overrides: Parameters<typeof buildTransaction>[0] = {},
    ) =>
      buildTransaction({
        uuid: 'occurrence',
        account,
        category,
        recurrence: {
          id: 1,
          uuid: 'recurrence-uuid',
          occurrenceDate: '2026-11-15',
          endDate: null,
        },
        date: '2026-11-15',
        amount: 150000,
        ...overrides,
      });

    it('confirms an account occurrence with its own amount and payment date', async () => {
      const { confirm, transactions } = setup();

      transactions.findByUuidForOwnerForUpdate.mockResolvedValue(occurrence());

      const confirmed = await confirm.execute({
        uuid: 'recurrence-uuid',
        occurrenceUuid: 'occurrence',
        ownerId: 1,
        amount: 152000,
        date: '2026-11-16',
      });

      expect(confirmed).toMatchObject({
        state: TransactionState.COMPLETED,
        amount: 152000,
        date: '2026-11-15',
        completedOn: '2026-11-16',
        occurrenceDate: '2026-11-15',
      });
    });

    it('answers 404 for a transaction of another recurrence and 409 for a completed one', async () => {
      const { confirm, transactions } = setup();

      transactions.findByUuidForOwnerForUpdate.mockResolvedValue(
        occurrence({
          recurrence: {
            id: 99,
            uuid: 'other',
            occurrenceDate: '2026-11-15',
            endDate: null,
          },
        }),
      );

      await expect(
        confirm.execute({
          uuid: 'recurrence-uuid',
          occurrenceUuid: 'occurrence',
          ownerId: 1,
        }),
      ).rejects.toThrow(RecurrenceOccurrenceNotFoundError);

      transactions.findByUuidForOwnerForUpdate.mockResolvedValue(
        occurrence({
          state: TransactionState.COMPLETED,
          completedOn: '2026-11-15',
        }),
      );

      await expect(
        confirm.execute({
          uuid: 'recurrence-uuid',
          occurrenceUuid: 'occurrence',
          ownerId: 1,
        }),
      ).rejects.toThrow(RecurrenceOccurrenceNotPlannedError);
    });

    it('confirms a card charge as a single-installment purchase', async () => {
      const { confirm, charges, createPurchase } = setup(cardRecurrence());

      charges.findByUuidForRecurrence.mockResolvedValue(
        buildRecurrenceCardCharge({ category }),
      );
      createPurchase.recordPlannedCharge.mockResolvedValue(
        buildCreditCardPurchase({
          id: 9,
          uuid: 'purchase',
          installments: [
            {
              number: 1,
              amount: 5990,
              date: '2026-11-15',
              invoice: buildCreditCardInvoice({ referenceMonth: '2026-12-01' }),
            },
          ],
        }),
      );

      const confirmed = await confirm.execute({
        uuid: 'recurrence-uuid',
        occurrenceUuid: 'charge-uuid',
        ownerId: 1,
        amount: 5990,
      });

      expect(createPurchase.recordPlannedCharge).toHaveBeenCalledWith({
        ownerId: 1,
        cardUuid: 'card',
        categoryUuid: 'category',
        description: 'Netflix',
        amount: 5990,
        purchaseDate: '2026-11-15',
        installmentCount: 1,
        notes: null,
      });
      expect(confirmed).toMatchObject({
        state: TransactionState.COMPLETED,
        amount: 5990,
        purchaseUuid: 'purchase',
        invoiceMonth: '2026-12-01',
        completedOn: '2026-11-15',
      });
    });

    it('moves one planned card charge and recomputes its invoice month', async () => {
      const { updateOccurrence, charges } = setup(cardRecurrence());

      charges.findByUuidForRecurrence.mockResolvedValue(
        buildRecurrenceCardCharge(),
      );

      const moved = await updateOccurrence.execute({
        uuid: 'recurrence-uuid',
        occurrenceUuid: 'charge-uuid',
        ownerId: 1,
        date: '2027-01-02',
      });

      expect(moved).toMatchObject({
        date: '2027-01-02',
        occurrenceDate: '2026-11-15',
        invoiceMonth: '2027-01-01',
        amount: 5590,
      });
    });

    it('skips one planned occurrence', async () => {
      const { cancel, transactions } = setup();

      transactions.findByUuidForOwnerForUpdate.mockResolvedValue(occurrence());

      await expect(
        cancel.execute({
          uuid: 'recurrence-uuid',
          occurrenceUuid: 'occurrence',
          ownerId: 1,
        }),
      ).resolves.toMatchObject({ state: TransactionState.CANCELED });
    });

    describe('dates against the end of the recurrence', () => {
      const input = {
        uuid: 'recurrence-uuid',
        occurrenceUuid: 'occurrence',
        ownerId: 1,
      };

      const scheduledAt = (date: string) => ({
        date,
        recurrence: {
          id: 1,
          uuid: 'recurrence-uuid',
          occurrenceDate: '2026-10-15',
          endDate: '2026-11-02',
        },
      });

      function onAccount(date = '2026-10-15') {
        const context = setup(
          buildRecurrence({ account, endDate: '2026-11-02' }),
        );

        context.transactions.findByUuidForOwnerForUpdate.mockResolvedValue(
          occurrence(scheduledAt(date)),
        );

        return context;
      }

      function onCard(date = '2026-10-15') {
        const context = setup(cardRecurrence({ endDate: '2026-11-02' }));

        context.charges.findByUuidForRecurrence.mockResolvedValue(
          buildRecurrenceCardCharge({
            category,
            occurrenceDate: '2026-10-15',
            date,
            invoiceMonth: '2026-11-01',
          }),
        );

        return context;
      }

      it.each([
        ['account', onAccount],
        ['card', onCard],
      ])(
        'moves a planned %s occurrence up to the end date and never past it',
        async (_target, context) => {
          await expect(
            context().updateOccurrence.execute({
              ...input,
              date: '2026-11-03',
            }),
          ).rejects.toThrow(OccurrenceAfterRecurrenceEndError);

          await expect(
            context().updateOccurrence.execute({
              ...input,
              date: '2026-11-02',
            }),
          ).resolves.toMatchObject({
            date: '2026-11-02',
            occurrenceDate: '2026-10-15',
          });
        },
      );

      it.each([
        ['account', onAccount],
        ['card', onCard],
      ])(
        'still edits a planned %s occurrence already dated past the end when its date stays',
        async (_target, context) => {
          await expect(
            context('2026-12-01').updateOccurrence.execute({
              ...input,
              amount: 7000,
              date: '2026-12-01',
            }),
          ).resolves.toMatchObject({ amount: 7000, date: '2026-12-01' });
        },
      );

      it('confirms an old account occurrence on a later payment date, keeping its scheduled dates', async () => {
        await expect(
          onAccount().confirm.execute({ ...input, date: '2026-12-20' }),
        ).resolves.toMatchObject({
          state: TransactionState.COMPLETED,
          occurrenceDate: '2026-10-15',
          date: '2026-10-15',
          completedOn: '2026-12-20',
        });
      });

      it('confirms an old card charge on a later purchase date, keeping its scheduled date', async () => {
        const { confirm, createPurchase } = onCard();

        createPurchase.recordPlannedCharge.mockResolvedValue(
          buildCreditCardPurchase({
            id: 9,
            uuid: 'purchase',
            installments: [
              {
                number: 1,
                amount: 5590,
                date: '2026-12-20',
                invoice: buildCreditCardInvoice({
                  referenceMonth: '2027-01-01',
                }),
              },
            ],
          }),
        );

        await expect(
          confirm.execute({ ...input, date: '2026-12-20' }),
        ).resolves.toMatchObject({
          state: TransactionState.COMPLETED,
          occurrenceDate: '2026-10-15',
          date: '2026-12-20',
          completedOn: '2026-12-20',
          invoiceMonth: '2027-01-01',
        });
        expect(createPurchase.recordPlannedCharge).toHaveBeenCalledWith(
          expect.objectContaining({ purchaseDate: '2026-12-20' }),
        );
      });
    });

    describe.each([
      ['ended as a whole', { state: RecurrenceState.ENDED }],
      ['past its end date', { endDate: '2026-11-02' }],
    ])('on a recurrence %s', (_ended, ended) => {
      const input = {
        uuid: 'recurrence-uuid',
        occurrenceUuid: 'occurrence',
        ownerId: 1,
      };

      function endedOnAccount() {
        const context = setup(buildRecurrence({ account, ...ended }));

        context.transactions.findByUuidForOwnerForUpdate.mockResolvedValue(
          occurrence({
            date: '2026-10-15',
            recurrence: {
              id: 1,
              uuid: 'recurrence-uuid',
              occurrenceDate: '2026-10-15',
              endDate: null,
            },
          }),
        );

        return context;
      }

      function endedOnCard() {
        const context = setup(cardRecurrence(ended));

        context.charges.findByUuidForRecurrence.mockResolvedValue(
          buildRecurrenceCardCharge({
            category,
            occurrenceDate: '2026-10-15',
            date: '2026-10-15',
            invoiceMonth: '2026-11-01',
          }),
        );

        return context;
      }

      it('edits, confirms, and cancels a planned account occurrence without touching the template', async () => {
        const editing = endedOnAccount();

        await expect(
          editing.updateOccurrence.execute({ ...input, amount: 160000 }),
        ).resolves.toMatchObject({
          amount: 160000,
          state: TransactionState.PLANNED,
        });

        const confirming = endedOnAccount();

        await expect(
          confirming.confirm.execute({ ...input, date: '2026-10-20' }),
        ).resolves.toMatchObject({
          state: TransactionState.COMPLETED,
          completedOn: '2026-10-20',
        });

        const canceling = endedOnAccount();

        await expect(canceling.cancel.execute(input)).resolves.toMatchObject({
          state: TransactionState.CANCELED,
        });

        for (const { recurrences } of [editing, confirming, canceling]) {
          expect(recurrences.update).not.toHaveBeenCalled();
        }
      });

      it('edits, confirms, and cancels a planned card charge without touching the template', async () => {
        const editing = endedOnCard();

        await expect(
          editing.updateOccurrence.execute({ ...input, amount: 5990 }),
        ).resolves.toMatchObject({
          amount: 5990,
          state: TransactionState.PLANNED,
        });

        const confirming = endedOnCard();

        confirming.createPurchase.recordPlannedCharge.mockResolvedValue(
          buildCreditCardPurchase({
            id: 9,
            uuid: 'purchase',
            installments: [
              {
                number: 1,
                amount: 5590,
                date: '2026-10-15',
                invoice: buildCreditCardInvoice({
                  referenceMonth: '2026-11-01',
                }),
              },
            ],
          }),
        );

        await expect(confirming.confirm.execute(input)).resolves.toMatchObject({
          state: TransactionState.COMPLETED,
          purchaseUuid: 'purchase',
        });

        const canceling = endedOnCard();

        await expect(canceling.cancel.execute(input)).resolves.toMatchObject({
          state: TransactionState.CANCELED,
        });

        for (const { recurrences } of [editing, confirming, canceling]) {
          expect(recurrences.update).not.toHaveBeenCalled();
        }
      });

      it('keeps rejecting a completed or canceled occurrence', async () => {
        const completed = endedOnAccount();

        completed.transactions.findByUuidForOwnerForUpdate.mockResolvedValue(
          occurrence({
            state: TransactionState.COMPLETED,
            completedOn: '2026-10-15',
          }),
        );

        await expect(completed.cancel.execute(input)).rejects.toThrow(
          RecurrenceOccurrenceNotPlannedError,
        );

        const canceled = endedOnCard();

        canceled.charges.findByUuidForRecurrence.mockResolvedValue(
          buildRecurrenceCardCharge({ state: TransactionState.CANCELED }),
        );

        await expect(canceled.confirm.execute(input)).rejects.toThrow(
          RecurrenceOccurrenceNotPlannedError,
        );
      });
    });
  });
});
