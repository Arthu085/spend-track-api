import { AccountType } from '@modules/accounts';
import { AccountOrmEntity } from '@modules/accounts/infrastructure/persistence/entities/account.orm-entity';
import { TransactionCategoryKind } from '@modules/transaction-categories';
import { TransactionCategoryOrmEntity } from '@modules/transaction-categories/infrastructure/persistence/entities/transaction-category.orm-entity';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { buildAccount } from '@test/support/builders/account.builder';
import { buildTransaction } from '@test/support/builders/transaction.builder';
import { TransactionState } from '../../../../domain/enums/transaction-state.enum';
import { TransactionType } from '../../../../domain/enums/transaction-type.enum';
import { TransactionOrmEntity } from '../../entities/transaction.orm-entity';
import { TransactionMapper } from '../transaction.mapper';

function accountRow(id: number): AccountOrmEntity {
  return Object.assign(new AccountOrmEntity(), {
    id,
    uuid: `account-${id}`,
    status: RecordStatus.ACTIVE,
    userId: 9,
    name: `Account ${id}`,
    type: AccountType.CHECKING,
    openingBalance: '0.00',
    openingBalanceDate: '2026-10-01',
    isDefault: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });
}

describe('TransactionMapper', () => {
  const base = {
    id: 4,
    uuid: 'transaction-uuid',
    status: RecordStatus.ACTIVE,
    userId: 9,
    description: 'Move',
    amount: '1020.80',
    date: '2026-10-29',
    state: TransactionState.COMPLETED,
    completedOn: '2026-10-30',
    canceledAt: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  it('maps a transfer row with both accounts and the amount in cents', () => {
    const orm = Object.assign(new TransactionOrmEntity(), base, {
      type: TransactionType.TRANSFER,
      accountId: 1,
      account: accountRow(1),
      destinationAccountId: 2,
      destinationAccount: accountRow(2),
      categoryId: null,
      category: null,
    });

    const transaction = TransactionMapper.toDomain(orm);

    expect(transaction).toMatchObject({
      id: 4,
      ownerId: 9,
      amount: 102080,
      completedOn: '2026-10-30',
      category: null,
    });
    expect(transaction.destinationAccount?.uuid).toBe('account-2');
  });

  it('keeps a soft-deleted category on the transaction', () => {
    const orm = Object.assign(new TransactionOrmEntity(), base, {
      type: TransactionType.EXPENSE,
      accountId: 1,
      account: accountRow(1),
      destinationAccountId: null,
      destinationAccount: null,
      categoryId: 3,
      category: Object.assign(new TransactionCategoryOrmEntity(), {
        id: 3,
        uuid: 'category-uuid',
        status: RecordStatus.INACTIVE,
        userId: 9,
        code: null,
        name: 'Old',
        kind: TransactionCategoryKind.EXPENSE,
        color: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(),
      }),
    });

    expect(TransactionMapper.toDomain(orm).category).toMatchObject({
      uuid: 'category-uuid',
      status: RecordStatus.INACTIVE,
    });
  });

  it('refuses a row loaded without its account', () => {
    const orm = Object.assign(new TransactionOrmEntity(), base, {
      type: TransactionType.EXPENSE,
      accountId: 1,
    });

    expect(() => TransactionMapper.toDomain(orm)).toThrow();
  });

  it('maps a new domain transaction to a row with foreign keys', () => {
    const orm = TransactionMapper.toOrm(
      buildTransaction({
        id: 0,
        amount: 5,
        account: buildAccount({ id: 7 }),
      }),
    );

    expect(orm.id).toBeUndefined();
    expect(orm.updatedAt).toBeUndefined();
    expect(orm).toMatchObject({
      amount: '0.05',
      accountId: 7,
      destinationAccountId: null,
      categoryId: 1,
    });
  });

  it('keeps the id of an existing transaction', () => {
    expect(TransactionMapper.toOrm(buildTransaction({ id: 12 })).id).toBe(12);
  });
});
