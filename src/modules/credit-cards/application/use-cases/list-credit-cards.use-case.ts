import { Inject, Injectable } from '@nestjs/common';
import { PaginatedResult } from '@shared/application/dto';
import { normalizeTextFilter } from '@shared/application/filters';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import {
  CREDIT_CARD_REPOSITORY,
  type CreditCardRepository,
} from '../../domain/repositories/credit-card.repository';
import {
  CreditCardStatements,
  type CreditCardWithBalance,
} from '../services/credit-card-statements';

export interface ListCreditCardsInput {
  ownerId: number;
  page: number;
  limit: number;
  name?: string;
  status?: RecordStatus;
}

@Injectable()
export class ListCreditCardsUseCase {
  constructor(
    @Inject(CREDIT_CARD_REPOSITORY)
    private readonly cardRepository: CreditCardRepository,
    private readonly statements: CreditCardStatements,
  ) {}

  async execute(
    input: ListCreditCardsInput,
  ): Promise<PaginatedResult<CreditCardWithBalance>> {
    const { items, total } = await this.cardRepository.findAllPaginatedByOwner(
      input.ownerId,
      (input.page - 1) * input.limit,
      input.limit,
      {
        name: normalizeTextFilter(input.name),
        status: input.status ?? RecordStatus.ACTIVE,
      },
    );

    return PaginatedResult.of(
      await this.statements.withBalances(items),
      total,
      input.page,
      input.limit,
    );
  }
}
