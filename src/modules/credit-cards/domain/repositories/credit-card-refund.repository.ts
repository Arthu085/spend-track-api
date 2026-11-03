import { CreditCardRefundEntity } from '../entities/credit-card-refund.entity';

export const CREDIT_CARD_REFUND_REPOSITORY = Symbol(
  'CREDIT_CARD_REFUND_REPOSITORY',
);

export interface CreditCardRefundRepository {
  findByUuidForPurchase(
    uuid: string,
    purchaseId: number,
  ): Promise<CreditCardRefundEntity | null>;
  create(refund: CreditCardRefundEntity): Promise<CreditCardRefundEntity>;
  softDelete(refund: CreditCardRefundEntity): Promise<void>;
}
