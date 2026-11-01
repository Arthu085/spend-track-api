import {
  InactiveAccountError,
  findOwnedAccount,
  type AccountEntity,
  type AccountRepository,
} from '@modules/accounts';
import {
  InactiveTransactionCategoryError,
  TransactionCategoryKind,
  findVisibleTransactionCategory,
  type TransactionCategoryEntity,
  type TransactionCategoryRepository,
} from '@modules/transaction-categories';
import { assertRecordActive } from '@shared/domain/policies';
import { CreditCardInvoiceEntity } from '../../domain/entities/credit-card-invoice.entity';
import { CreditCardPurchaseEntity } from '../../domain/entities/credit-card-purchase.entity';
import { CreditCardEntity } from '../../domain/entities/credit-card.entity';
import { CreditCardInvoiceNotFoundError } from '../../domain/errors/credit-card-invoice-not-found.error';
import { CreditCardNotFoundError } from '../../domain/errors/credit-card-not-found.error';
import { CreditCardPurchaseCategoryKindError } from '../../domain/errors/credit-card-purchase-category-kind.error';
import { CreditCardPurchaseNotFoundError } from '../../domain/errors/credit-card-purchase-not-found.error';
import { InactiveCreditCardError } from '../../domain/errors/inactive-credit-card.error';
import type { CreditCardInvoiceRepository } from '../../domain/repositories/credit-card-invoice.repository';
import type { CreditCardPurchaseRepository } from '../../domain/repositories/credit-card-purchase.repository';
import type { CreditCardRepository } from '../../domain/repositories/credit-card.repository';

export async function findOwnedCreditCard(
  cardRepository: CreditCardRepository,
  uuid: string,
  ownerId: number,
): Promise<CreditCardEntity> {
  const card = await cardRepository.findByUuidForOwner(uuid, ownerId);

  if (!card) {
    throw new CreditCardNotFoundError();
  }

  return card;
}

export async function findActiveCreditCard(
  cardRepository: CreditCardRepository,
  uuid: string,
  ownerId: number,
): Promise<CreditCardEntity> {
  const card = await findOwnedCreditCard(cardRepository, uuid, ownerId);

  assertRecordActive(card, new InactiveCreditCardError());

  return card;
}

export async function findOwnedInvoice(
  invoiceRepository: CreditCardInvoiceRepository,
  uuid: string,
  ownerId: number,
): Promise<CreditCardInvoiceEntity> {
  const invoice = await invoiceRepository.findByUuidForOwner(uuid, ownerId);

  if (!invoice) {
    throw new CreditCardInvoiceNotFoundError();
  }

  return invoice;
}

export async function findOwnedPurchase(
  purchaseRepository: CreditCardPurchaseRepository,
  uuid: string,
  ownerId: number,
): Promise<CreditCardPurchaseEntity> {
  const purchase = await purchaseRepository.findByUuidForOwner(uuid, ownerId);

  if (!purchase) {
    throw new CreditCardPurchaseNotFoundError();
  }

  return purchase;
}

export async function findActiveExpenseCategory(
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

  if (category.kind !== TransactionCategoryKind.EXPENSE) {
    throw new CreditCardPurchaseCategoryKindError();
  }

  return category;
}

export async function findActiveAccount(
  accountRepository: AccountRepository,
  uuid: string,
  ownerId: number,
): Promise<AccountEntity> {
  const account = await findOwnedAccount(accountRepository, uuid, ownerId);

  assertRecordActive(account, new InactiveAccountError());

  return account;
}
