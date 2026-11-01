import { Inject, Injectable } from '@nestjs/common';
import { ACCOUNT_REPOSITORY, type AccountRepository } from '@modules/accounts';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { CreditCardPaymentEntity } from '../../domain/entities/credit-card-payment.entity';
import { CreditCardPaymentNotFoundError } from '../../domain/errors/credit-card-payment-not-found.error';
import {
  CREDIT_CARD_INVOICE_REPOSITORY,
  type CreditCardInvoiceRepository,
} from '../../domain/repositories/credit-card-invoice.repository';
import {
  CREDIT_CARD_PAYMENT_REPOSITORY,
  type CreditCardPaymentRepository,
} from '../../domain/repositories/credit-card-payment.repository';
import {
  CREDIT_CARD_REPOSITORY,
  type CreditCardRepository,
} from '../../domain/repositories/credit-card.repository';
import { findOwnedInvoice } from '../services/credit-card-references';

export interface CancelCreditCardPaymentInput {
  invoiceUuid: string;
  paymentUuid: string;
  ownerId: number;
}

@Injectable()
export class CancelCreditCardPaymentUseCase {
  constructor(
    @Inject(CREDIT_CARD_REPOSITORY)
    private readonly cardRepository: CreditCardRepository,
    @Inject(CREDIT_CARD_INVOICE_REPOSITORY)
    private readonly invoiceRepository: CreditCardInvoiceRepository,
    @Inject(CREDIT_CARD_PAYMENT_REPOSITORY)
    private readonly paymentRepository: CreditCardPaymentRepository,
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: AccountRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
  ) {}

  async execute(
    input: CancelCreditCardPaymentInput,
  ): Promise<CreditCardPaymentEntity> {
    return this.transactionManager.runInTransaction(async () => {
      await this.accountRepository.lockOwnerAccounts(input.ownerId);
      await this.cardRepository.lockOwnerCards(input.ownerId);

      const invoice = await findOwnedInvoice(
        this.invoiceRepository,
        input.invoiceUuid,
        input.ownerId,
      );

      const payment = await this.paymentRepository.findByUuidForInvoice(
        input.paymentUuid,
        invoice.id,
      );

      if (!payment) {
        throw new CreditCardPaymentNotFoundError();
      }

      return this.paymentRepository.update(payment.cancel());
    });
  }
}
