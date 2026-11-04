import { Inject, Injectable } from '@nestjs/common';
import type { PendingOperationsSummary } from '@shared/domain/pending-operations';
import {
  CREDIT_CARD_REPOSITORY,
  type CreditCardRepository,
} from '../../domain/repositories/credit-card.repository';
import {
  CREDIT_CARD_PENDING_OPERATIONS,
  type CreditCardPendingOperations,
} from '../ports/credit-card-pending-operations.port';
import { findOwnedCreditCard } from '../services/credit-card-references';

@Injectable()
export class GetCreditCardPendingOperationsUseCase {
  constructor(
    @Inject(CREDIT_CARD_REPOSITORY)
    private readonly cardRepository: CreditCardRepository,
    @Inject(CREDIT_CARD_PENDING_OPERATIONS)
    private readonly pendingOperations: CreditCardPendingOperations,
  ) {}

  async execute(
    uuid: string,
    ownerId: number,
  ): Promise<PendingOperationsSummary> {
    const card = await findOwnedCreditCard(this.cardRepository, uuid, ownerId);

    return this.pendingOperations.summarize(ownerId, card.id);
  }
}
