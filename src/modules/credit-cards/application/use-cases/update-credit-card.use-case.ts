import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { assertRecordActive } from '@shared/domain/policies';
import type { CreditCardDetails } from '../../domain/entities/credit-card.entity';
import { InactiveCreditCardError } from '../../domain/errors/inactive-credit-card.error';
import {
  CREDIT_CARD_REPOSITORY,
  type CreditCardRepository,
} from '../../domain/repositories/credit-card.repository';
import { findOwnedCreditCard } from '../services/credit-card-references';
import {
  CreditCardStatements,
  type CreditCardWithBalance,
} from '../services/credit-card-statements';

export interface UpdateCreditCardInput extends Partial<CreditCardDetails> {
  uuid: string;
  ownerId: number;
  isDefault?: boolean;
}

@Injectable()
export class UpdateCreditCardUseCase {
  constructor(
    @Inject(CREDIT_CARD_REPOSITORY)
    private readonly cardRepository: CreditCardRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
    private readonly statements: CreditCardStatements,
  ) {}

  async execute(input: UpdateCreditCardInput): Promise<CreditCardWithBalance> {
    const updated = await this.transactionManager.runInTransaction(async () => {
      await this.cardRepository.lockOwnerCards(input.ownerId);

      const card = await findOwnedCreditCard(
        this.cardRepository,
        input.uuid,
        input.ownerId,
      );

      assertRecordActive(card, new InactiveCreditCardError());

      const isDefault = input.isDefault ?? card.isDefault;

      if (isDefault && !card.isDefault) {
        await this.cardRepository.clearDefault(input.ownerId);
      }

      return this.cardRepository.update(
        card
          .withDetails({
            name: input.name ?? card.name,
            creditLimit: input.creditLimit ?? card.creditLimit,
            closingDay: input.closingDay ?? card.closingDay,
            dueDay: input.dueDay ?? card.dueDay,
          })
          .withDefault(isDefault),
      );
    });

    return this.statements.withBalance(updated);
  }
}
