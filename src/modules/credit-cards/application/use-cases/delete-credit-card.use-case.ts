import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { CreditCardHasHistoryError } from '../../domain/errors/credit-card-has-history.error';
import {
  CREDIT_CARD_REPOSITORY,
  type CreditCardRepository,
} from '../../domain/repositories/credit-card.repository';
import { findOwnedCreditCard } from '../services/credit-card-references';

export interface DeleteCreditCardInput {
  uuid: string;
  ownerId: number;
}

@Injectable()
export class DeleteCreditCardUseCase {
  constructor(
    @Inject(CREDIT_CARD_REPOSITORY)
    private readonly cardRepository: CreditCardRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
  ) {}

  async execute(input: DeleteCreditCardInput): Promise<void> {
    await this.transactionManager.runInTransaction(async () => {
      await this.cardRepository.lockOwnerCards(input.ownerId);

      const card = await findOwnedCreditCard(
        this.cardRepository,
        input.uuid,
        input.ownerId,
      );

      if (await this.cardRepository.hasHistory(input.ownerId, card.id)) {
        throw new CreditCardHasHistoryError();
      }

      await this.cardRepository.softDelete(card);
    });
  }
}
