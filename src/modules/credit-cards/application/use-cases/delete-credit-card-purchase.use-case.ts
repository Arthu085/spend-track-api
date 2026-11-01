import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { financeToday } from '@shared/domain/calendar';
import {
  CREDIT_CARD_PURCHASE_REPOSITORY,
  type CreditCardPurchaseRepository,
} from '../../domain/repositories/credit-card-purchase.repository';
import {
  CREDIT_CARD_REPOSITORY,
  type CreditCardRepository,
} from '../../domain/repositories/credit-card.repository';
import { findOwnedPurchase } from '../services/credit-card-references';

export interface DeleteCreditCardPurchaseInput {
  uuid: string;
  ownerId: number;
}

@Injectable()
export class DeleteCreditCardPurchaseUseCase {
  constructor(
    @Inject(CREDIT_CARD_PURCHASE_REPOSITORY)
    private readonly purchaseRepository: CreditCardPurchaseRepository,
    @Inject(CREDIT_CARD_REPOSITORY)
    private readonly cardRepository: CreditCardRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
  ) {}

  async execute(input: DeleteCreditCardPurchaseInput): Promise<void> {
    await this.transactionManager.runInTransaction(async () => {
      await this.cardRepository.lockOwnerCards(input.ownerId);

      const purchase = await findOwnedPurchase(
        this.purchaseRepository,
        input.uuid,
        input.ownerId,
      );

      purchase.assertDeletable(financeToday());

      await this.purchaseRepository.softDelete(purchase);
    });
  }
}
