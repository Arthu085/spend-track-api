import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { CreditCardRefundEntity } from '../../domain/entities/credit-card-refund.entity';
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
import { CreditCardInvoiceAssigner } from '../services/credit-card-invoice-assigner';
import { findOwnedPurchase } from '../services/credit-card-references';

export interface CreateCreditCardRefundInput {
  purchaseUuid: string;
  ownerId: number;
  amount: number;
  date: string;
  notes?: string | null;
}

@Injectable()
export class CreateCreditCardRefundUseCase {
  constructor(
    @Inject(CREDIT_CARD_PURCHASE_REPOSITORY)
    private readonly purchaseRepository: CreditCardPurchaseRepository,
    @Inject(CREDIT_CARD_REFUND_REPOSITORY)
    private readonly refundRepository: CreditCardRefundRepository,
    @Inject(CREDIT_CARD_REPOSITORY)
    private readonly cardRepository: CreditCardRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
    private readonly invoiceAssigner: CreditCardInvoiceAssigner,
  ) {}

  async execute(
    input: CreateCreditCardRefundInput,
  ): Promise<CreditCardRefundEntity> {
    return this.transactionManager.runInTransaction(async () => {
      await this.cardRepository.lockOwnerCards(input.ownerId);

      const purchase = await findOwnedPurchase(
        this.purchaseRepository,
        input.purchaseUuid,
        input.ownerId,
      );

      purchase.assertRefundable(input.amount, input.date);

      const [invoice] = await this.invoiceAssigner.invoicesFrom(
        purchase.card,
        input.date,
        1,
      );

      return this.refundRepository.create(
        CreditCardRefundEntity.create({
          uuid: randomUUID(),
          ownerId: input.ownerId,
          purchase,
          invoice,
          amount: input.amount,
          date: input.date,
          notes: input.notes ?? null,
        }),
      );
    });
  }
}
