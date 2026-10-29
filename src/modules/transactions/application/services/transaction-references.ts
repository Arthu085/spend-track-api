import {
  InactiveAccountError,
  findOwnedAccount,
  type AccountEntity,
  type AccountRepository,
} from '@modules/accounts';
import {
  InactiveTransactionCategoryError,
  findVisibleTransactionCategory,
  type TransactionCategoryEntity,
  type TransactionCategoryRepository,
} from '@modules/transaction-categories';
import { assertRecordActive } from '@shared/domain/policies';

export async function findActiveAccount(
  accountRepository: AccountRepository,
  uuid: string,
  ownerId: number,
): Promise<AccountEntity> {
  const account = await findOwnedAccount(accountRepository, uuid, ownerId);

  assertRecordActive(account, new InactiveAccountError());

  return account;
}

export async function findActiveCategory(
  categoryRepository: TransactionCategoryRepository,
  uuid: string,
  ownerId: number,
): Promise<TransactionCategoryEntity> {
  const category = await findVisibleTransactionCategory(
    categoryRepository,
    uuid,
    ownerId,
  );

  assertRecordActive(category, new InactiveTransactionCategoryError());

  return category;
}
