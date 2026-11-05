import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  ACCOUNT_REPOSITORY,
  findOwnedAccount,
  type AccountEntity,
  type AccountRepository,
} from '@modules/accounts';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { financeToday } from '@shared/domain/calendar';
import { CreditCardPaymentEntity } from '../../domain/entities/credit-card-payment.entity';
import { CreditCardPaymentSource } from '../../domain/enums/credit-card-payment-source.enum';
import { CreditCardHistoricalSettlementNotBeforeOpeningError } from '../../domain/errors/credit-card-historical-settlement-not-before-opening.error';
import { CreditCardPaymentExceedsOutstandingError } from '../../domain/errors/credit-card-payment-exceeds-outstanding.error';
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
import { CreditCardStatements } from '../services/credit-card-statements';

export interface RecordHistoricalSettlementInput {
  invoiceUuid: string;
  ownerId: number;
  accountUuid: string;
  amount: number;
  paidOn: string;
}

@Injectable()
export class RecordHistoricalSettlementUseCase {
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
    private readonly statements: CreditCardStatements,
  ) {}

  async execute(
    input: RecordHistoricalSettlementInput,
  ): Promise<CreditCardPaymentEntity> {
    return this.transactionManager.runInTransaction(async () => {
      await this.accountRepository.lockOwnerAccounts(input.ownerId);
      await this.cardRepository.lockOwnerCards(input.ownerId);

      const invoice = await findOwnedInvoice(
        this.invoiceRepository,
        input.invoiceUuid,
        input.ownerId,
      );

      const account = await findOwnedAccount(
        this.accountRepository,
        input.accountUuid,
        input.ownerId,
      );

      this.assertSettledBeforeOpening(account, input.paidOn);

      const { outstanding } = await this.statements.ofInvoice(invoice);

      if (input.amount > outstanding) {
        throw new CreditCardPaymentExceedsOutstandingError();
      }

      return this.paymentRepository.create(
        CreditCardPaymentEntity.create({
          uuid: randomUUID(),
          ownerId: input.ownerId,
          invoice,
          account,
          amount: input.amount,
          paidOn: input.paidOn,
          source: CreditCardPaymentSource.HISTORICAL_SETTLEMENT,
        }),
      );
    });
  }

  private assertSettledBeforeOpening(
    account: AccountEntity,
    paidOn: string,
  ): void {
    if (paidOn >= account.openingBalanceDate || paidOn > financeToday()) {
      throw new CreditCardHistoricalSettlementNotBeforeOpeningError();
    }
  }
}
