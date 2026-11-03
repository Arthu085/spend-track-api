import type { SpendingPerspective } from '@modules/preferences';
import type { TransactionCategoryEntity } from '@modules/transaction-categories';
import { CreditCardPurchaseEntity } from '../entities/credit-card-purchase.entity';

export const CREDIT_CARD_PURCHASE_REPOSITORY = Symbol(
  'CREDIT_CARD_PURCHASE_REPOSITORY',
);

export interface PaginatedCreditCardPurchases {
  items: CreditCardPurchaseEntity[];
  total: number;
}

export interface CreditCardPurchaseListFilters {
  cardUuid?: string;
  categoryUuid?: string;
  from?: string;
  to?: string;
  description?: string;
}

export interface CreditCardSpendingQuery {
  from: string;
  to: string;
  perspective: SpendingPerspective;
}

export interface CategorySpendingTotal {
  category: TransactionCategoryEntity;
  total: number;
}

export interface CreditCardPurchaseRepository {
  findAllPaginatedByOwner(
    ownerId: number,
    offset: number,
    limit: number,
    filters?: CreditCardPurchaseListFilters,
  ): Promise<PaginatedCreditCardPurchases>;
  findByUuidForOwner(
    uuid: string,
    ownerId: number,
  ): Promise<CreditCardPurchaseEntity | null>;
  sumSpendingByCategory(
    ownerId: number,
    query: CreditCardSpendingQuery,
  ): Promise<CategorySpendingTotal[]>;
  create(purchase: CreditCardPurchaseEntity): Promise<CreditCardPurchaseEntity>;
  update(purchase: CreditCardPurchaseEntity): Promise<CreditCardPurchaseEntity>;
  softDelete(purchase: CreditCardPurchaseEntity): Promise<void>;
}
