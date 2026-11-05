import { CreditCardPaymentEntity } from '../entities/credit-card-payment.entity';

export const CREDIT_CARD_PAYMENT_REPOSITORY = Symbol(
  'CREDIT_CARD_PAYMENT_REPOSITORY',
);

export interface CreditCardPaymentRepository {
  findByUuidForInvoice(
    uuid: string,
    invoiceId: number,
  ): Promise<CreditCardPaymentEntity | null>;
  sumByAccount(
    ownerId: number,
    accountIds: readonly number[],
  ): Promise<Map<number, number>>;
  existsForAccount(ownerId: number, accountId: number): Promise<boolean>;
  findEarliestDateForAccount(
    ownerId: number,
    accountId: number,
  ): Promise<string | null>;
  findLatestHistoricalDateForAccount(
    ownerId: number,
    accountId: number,
  ): Promise<string | null>;
  create(payment: CreditCardPaymentEntity): Promise<CreditCardPaymentEntity>;
  update(payment: CreditCardPaymentEntity): Promise<CreditCardPaymentEntity>;
}
