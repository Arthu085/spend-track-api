import { Inject, Injectable } from '@nestjs/common';
import { PaginatedResult } from '@shared/application/dto';
import type { InvoiceStatement } from '../../domain/billing/invoice-statement';
import {
  CREDIT_CARD_REPOSITORY,
  type CreditCardRepository,
} from '../../domain/repositories/credit-card.repository';
import { findOwnedCreditCard } from '../services/credit-card-references';
import { CreditCardStatements } from '../services/credit-card-statements';

export interface ListCreditCardInvoicesInput {
  cardUuid: string;
  ownerId: number;
  page: number;
  limit: number;
}

@Injectable()
export class ListCreditCardInvoicesUseCase {
  constructor(
    @Inject(CREDIT_CARD_REPOSITORY)
    private readonly cardRepository: CreditCardRepository,
    private readonly statements: CreditCardStatements,
  ) {}

  async execute(
    input: ListCreditCardInvoicesInput,
  ): Promise<PaginatedResult<InvoiceStatement>> {
    const card = await findOwnedCreditCard(
      this.cardRepository,
      input.cardUuid,
      input.ownerId,
    );

    const statements = (
      await this.statements.forOwner(input.ownerId, [card.id])
    ).reverse();

    const offset = (input.page - 1) * input.limit;

    return PaginatedResult.of(
      statements.slice(offset, offset + input.limit),
      statements.length,
      input.page,
      input.limit,
    );
  }
}
