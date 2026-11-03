import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  ACCOUNT_LEDGERS,
  type AccountLedger,
  type AccountLedgerRegistry,
} from '@modules/accounts';
import {
  CREDIT_CARD_PAYMENT_REPOSITORY,
  type CreditCardPaymentRepository,
} from '../../domain/repositories/credit-card-payment.repository';

@Injectable()
export class CreditCardPaymentLedger implements AccountLedger, OnModuleInit {
  constructor(
    @Inject(CREDIT_CARD_PAYMENT_REPOSITORY)
    private readonly paymentRepository: CreditCardPaymentRepository,
    @Inject(ACCOUNT_LEDGERS)
    private readonly registry: AccountLedgerRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async balanceChanges(
    ownerId: number,
    accountIds: readonly number[],
  ): Promise<Map<number, number>> {
    const paid = await this.paymentRepository.sumByAccount(ownerId, accountIds);

    return new Map(
      [...paid].map(([accountId, amount]) => [accountId, -amount]),
    );
  }

  hasEntries(ownerId: number, accountId: number): Promise<boolean> {
    return this.paymentRepository.existsForAccount(ownerId, accountId);
  }
}
