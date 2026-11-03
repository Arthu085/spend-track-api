import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { CreditCardEntity } from '../entities/credit-card.entity';

export const CREDIT_CARD_REPOSITORY = Symbol('CREDIT_CARD_REPOSITORY');

export interface PaginatedCreditCards {
  items: CreditCardEntity[];
  total: number;
}

export interface CreditCardListFilters {
  name?: string;
  status?: RecordStatus;
}

export interface CreditCardRepository {
  findAllPaginatedByOwner(
    ownerId: number,
    offset: number,
    limit: number,
    filters?: CreditCardListFilters,
  ): Promise<PaginatedCreditCards>;
  findByUuidForOwner(
    uuid: string,
    ownerId: number,
  ): Promise<CreditCardEntity | null>;
  hasPurchases(ownerId: number, cardId: number): Promise<boolean>;
  lockOwnerCards(ownerId: number): Promise<void>;
  clearDefault(ownerId: number): Promise<void>;
  create(card: CreditCardEntity): Promise<CreditCardEntity>;
  update(card: CreditCardEntity): Promise<CreditCardEntity>;
  softDelete(card: CreditCardEntity): Promise<void>;
}
