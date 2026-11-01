import { TransactionCategoryKind } from '@modules/transaction-categories';
import { buildAccount } from '@test/support/builders/account.builder';
import { buildTransactionCategory } from '@test/support/builders/transaction-category.builder';
import { buildTransaction } from '@test/support/builders/transaction.builder';
import { TransactionState } from '../../enums/transaction-state.enum';
import { TransactionType } from '../../enums/transaction-type.enum';
import { InvalidTransactionReferencesError } from '../../errors/invalid-transaction-references.error';
import { TransactionCategoryKindMismatchError } from '../../errors/transaction-category-kind-mismatch.error';
import { TransactionNotDeletableError } from '../../errors/transaction-not-deletable.error';
import { TransactionNotEditableError } from '../../errors/transaction-not-editable.error';
import { TransactionStateTransitionError } from '../../errors/transaction-state-transition.error';
import { TransferSameAccountError } from '../../errors/transfer-same-account.error';
import {
  TransactionEntity,
  type CreateTransactionInput,
} from '../transaction.entity';

const source = buildAccount({ id: 1, uuid: 'source' });
const destination = buildAccount({ id: 2, uuid: 'destination' });
const expenseCategory = buildTransactionCategory();

const incomeCategory = buildTransactionCategory({
  id: 2,
  uuid: 'salary',
  kind: TransactionCategoryKind.INCOME,
});

function createInput(
  overrides: Partial<CreateTransactionInput> = {},
): CreateTransactionInput {
  return {
    uuid: 'new-uuid',
    ownerId: 1,
    type: TransactionType.EXPENSE,
    description: 'Groceries',
    amount: 1000,
    date: '2026-10-29',
    state: TransactionState.PLANNED,
    completedOn: null,
    account: source,
    destinationAccount: null,
    category: expenseCategory,
    notes: null,
    ...overrides,
  };
}

describe('TransactionEntity', () => {
  describe('create', () => {
    it('creates a planned transaction without an effective date', () => {
      const transaction = TransactionEntity.create(
        createInput({ completedOn: '2026-10-30' }),
      );

      expect(transaction).toMatchObject({
        id: 0,
        state: TransactionState.PLANNED,
        completedOn: null,
        canceledAt: null,
      });
    });

    it('defaults the effective date of a completed transaction to its date', () => {
      const transaction = TransactionEntity.create(
        createInput({ state: TransactionState.COMPLETED }),
      );

      expect(transaction.completedOn).toBe('2026-10-29');
    });

    it('keeps an explicit effective date', () => {
      const transaction = TransactionEntity.create(
        createInput({
          state: TransactionState.COMPLETED,
          completedOn: '2026-10-30',
        }),
      );

      expect(transaction.completedOn).toBe('2026-10-30');
    });

    it('creates a transfer between two accounts without a category', () => {
      const transfer = TransactionEntity.create(
        createInput({
          type: TransactionType.TRANSFER,
          destinationAccount: destination,
          category: null,
        }),
      );

      expect(transfer.destinationAccount?.uuid).toBe('destination');
    });

    it.each([
      [
        'a category whose kind differs from the type',
        { category: incomeCategory },
        TransactionCategoryKindMismatchError,
      ],
      [
        'income without a category',
        { type: TransactionType.INCOME, category: null },
        InvalidTransactionReferencesError,
      ],
      [
        'an expense with a destination account',
        { destinationAccount: destination },
        InvalidTransactionReferencesError,
      ],
      [
        'a transfer with a category',
        { type: TransactionType.TRANSFER, destinationAccount: destination },
        InvalidTransactionReferencesError,
      ],
      [
        'a transfer without a destination',
        { type: TransactionType.TRANSFER, category: null },
        InvalidTransactionReferencesError,
      ],
      [
        'a transfer to the same account',
        {
          type: TransactionType.TRANSFER,
          destinationAccount: buildAccount({ id: 1 }),
          category: null,
        },
        TransferSameAccountError,
      ],
    ])('rejects %s', (_, overrides, error) => {
      expect(() => TransactionEntity.create(createInput(overrides))).toThrow(
        error,
      );
    });
  });

  describe('state transitions', () => {
    it('completes a planned transaction once', () => {
      const completed = buildTransaction().complete('2026-10-30');

      expect(completed).toMatchObject({
        state: TransactionState.COMPLETED,
        completedOn: '2026-10-30',
      });
      expect(() => completed.complete('2026-10-31')).toThrow(
        TransactionStateTransitionError,
      );
    });

    it('cancels a completed transaction and keeps its effective date', () => {
      const canceled = buildTransaction({
        state: TransactionState.COMPLETED,
        completedOn: '2026-10-30',
      }).cancel();

      expect(canceled.state).toBe(TransactionState.CANCELED);
      expect(canceled.completedOn).toBe('2026-10-30');
      expect(canceled.canceledAt).toBeInstanceOf(Date);
    });

    it('treats CANCELED as final', () => {
      const canceled = buildTransaction().cancel();

      expect(() => canceled.cancel()).toThrow(TransactionStateTransitionError);
      expect(() => canceled.complete('2026-10-30')).toThrow(
        TransactionStateTransitionError,
      );
    });
  });

  describe('editing', () => {
    it('accepts every change on a planned transaction', () => {
      const planned = buildTransaction();

      expect(() =>
        planned.assertEditable({ amount: 1, date: '2026-01-01' }),
      ).not.toThrow();
    });

    it('lets a completed transaction resend its unchanged financial fields', () => {
      const completed = buildTransaction({
        state: TransactionState.COMPLETED,
        completedOn: '2026-10-29',
      });

      expect(() =>
        completed.assertEditable({
          amount: completed.amount,
          date: completed.date,
          accountUuid: completed.account.uuid,
        }),
      ).not.toThrow();
    });

    it.each([
      [{ amount: 1 }],
      [{ date: '2026-01-01' }],
      [{ accountUuid: 'other' }],
      [{ destinationAccountUuid: 'other' }],
    ])('rejects changing %o on a completed transaction', (changes) => {
      const completed = buildTransaction({
        state: TransactionState.COMPLETED,
        completedOn: '2026-10-29',
      });

      expect(() => completed.assertEditable(changes)).toThrow(
        TransactionNotEditableError,
      );
    });

    it('rejects any edit of a canceled transaction', () => {
      expect(() => buildTransaction().cancel().assertEditable({})).toThrow(
        TransactionNotEditableError,
      );
    });

    it('replaces the details and re-checks the references', () => {
      const transaction = buildTransaction();

      const updated = transaction.withDetails({
        description: 'Market',
        amount: 500,
        date: '2026-11-01',
        account: destination,
        destinationAccount: null,
        category: expenseCategory,
        notes: 'weekly',
      });

      expect(updated).toMatchObject({
        description: 'Market',
        amount: 500,
        notes: 'weekly',
        type: TransactionType.EXPENSE,
      });
      expect(() =>
        transaction.withDetails({
          ...updated,
          category: incomeCategory,
        }),
      ).toThrow(TransactionCategoryKindMismatchError);
    });
  });

  it('deletes only planned transactions', () => {
    expect(() => buildTransaction().assertDeletable()).not.toThrow();
    expect(() => buildTransaction().cancel().assertDeletable()).toThrow(
      TransactionNotDeletableError,
    );
  });
});
