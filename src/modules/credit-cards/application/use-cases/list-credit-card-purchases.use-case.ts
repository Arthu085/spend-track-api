import { Inject, Injectable } from '@nestjs/common';
import { PaginatedResult } from '@shared/application/dto';
import { normalizeTextFilter } from '@shared/application/filters';
import { CreditCardPurchaseEntity } from '../../domain/entities/credit-card-purchase.entity';
import {
  CREDIT_CARD_PURCHASE_REPOSITORY,
  type CreditCardPurchaseListFilters,
  type CreditCardPurchaseRepository,
} from '../../domain/repositories/credit-card-purchase.repository';

export interface ListCreditCardPurchasesInput extends CreditCardPurchaseListFilters {
  ownerId: number;
  page: number;
  limit: number;
}

@Injectable()
export class ListCreditCardPurchasesUseCase {
  constructor(
    @Inject(CREDIT_CARD_PURCHASE_REPOSITORY)
    private readonly purchaseRepository: CreditCardPurchaseRepository,
  ) {}

  async execute(
    input: ListCreditCardPurchasesInput,
  ): Promise<PaginatedResult<CreditCardPurchaseEntity>> {
    const { items, total } =
      await this.purchaseRepository.findAllPaginatedByOwner(
        input.ownerId,
        (input.page - 1) * input.limit,
        input.limit,
        {
          cardUuid: input.cardUuid,
          categoryUuid: input.categoryUuid,
          from: input.from,
          to: input.to,
          description: normalizeTextFilter(input.description),
        },
      );

    return PaginatedResult.of(items, total, input.page, input.limit);
  }
}
