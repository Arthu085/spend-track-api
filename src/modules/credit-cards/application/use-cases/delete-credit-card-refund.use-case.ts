import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { financeToday } from '@shared/domain/calendar';
import { CreditCardRefundNotFoundError } from '../../domain/errors/credit-card-refund-not-found.error';
import {
  CREDIT_CARD_PURCHASE_REPOSITORY,
  type CreditCardPurchaseRepository,
} from '../../domain/repositories/credit-card-purchase.repository';
import {
  CREDIT_CARD_REFUND_REPOSITORY,
  type CreditCardRefundRepository,
} from '../../domain/repositories/credit-card-refund.repository';
import {
  CREDIT_CARD_REPOSITORY,
  type CreditCardRepository,
} from '../../domain/repositories/credit-card.repository';
import { findOwnedPurchase } from '../services/credit-card-references';

export interface DeleteCreditCardRefundInput {
  purchaseUuid: string;
  refundUuid: string;
  ownerId: number;
}

@Injectable()
export class DeleteCreditCardRefundUseCase {
  constructor(
    @Inject(CREDIT_CARD_PURCHASE_REPOSITORY)
    private readonly purchaseRepository: CreditCardPurchaseRepository,
    @Inject(CREDIT_CARD_REFUND_REPOSITORY)
    private readonly refundRepository: CreditCardRefundRepository,
    @Inject(CREDIT_CARD_REPOSITORY)
    private readonly cardRepository: CreditCardRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
  ) {}

  async execute(input: DeleteCreditCardRefundInput): Promise<void> {
    await this.transactionManager.runInTransaction(async () => {
      await this.cardRepository.lockOwnerCards(input.ownerId);

      const purchase = await findOwnedPurchase(
        this.purchaseRepository,
        input.purchaseUuid,
        input.ownerId,
      );

      const refund = await this.refundRepository.findByUuidForPurchase(
        input.refundUuid,
        purchase.id,
      );

      if (!refund) {
        throw new CreditCardRefundNotFoundError();
      }

      refund.assertDeletable(financeToday());

      await this.refundRepository.softDelete(refund);
    });
  }
}
