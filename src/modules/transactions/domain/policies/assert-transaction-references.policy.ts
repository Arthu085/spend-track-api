import type { AccountEntity } from '@modules/accounts';
import {
  TransactionCategoryKind,
  type TransactionCategoryEntity,
} from '@modules/transaction-categories';
import { TransactionType } from '../enums/transaction-type.enum';
import { InvalidTransactionReferencesError } from '../errors/invalid-transaction-references.error';
import { TransactionCategoryKindMismatchError } from '../errors/transaction-category-kind-mismatch.error';
import { TransferSameAccountError } from '../errors/transfer-same-account.error';

export interface TransactionReferences {
  type: TransactionType;
  account: AccountEntity;
  destinationAccount: AccountEntity | null;
  category: TransactionCategoryEntity | null;
}

const CATEGORY_KIND_BY_TYPE: Record<
  Exclude<TransactionType, TransactionType.TRANSFER>,
  TransactionCategoryKind
> = {
  [TransactionType.INCOME]: TransactionCategoryKind.INCOME,
  [TransactionType.EXPENSE]: TransactionCategoryKind.EXPENSE,
};

export function assertTransactionReferences(
  references: TransactionReferences,
): void {
  const { type, account, destinationAccount, category } = references;

  if (type === TransactionType.TRANSFER) {
    if (destinationAccount === null || category !== null) {
      throw new InvalidTransactionReferencesError();
    }

    if (destinationAccount.id === account.id) {
      throw new TransferSameAccountError();
    }

    return;
  }

  if (destinationAccount !== null || category === null) {
    throw new InvalidTransactionReferencesError();
  }

  if (category.kind !== CATEGORY_KIND_BY_TYPE[type]) {
    throw new TransactionCategoryKindMismatchError();
  }
}
