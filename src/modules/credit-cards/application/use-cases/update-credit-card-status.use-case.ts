import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import {
  CREDIT_CARD_REPOSITORY,
  type CreditCardRepository,
} from '../../domain/repositories/credit-card.repository';
import { findOwnedCreditCard } from '../services/credit-card-references';
import {
  CreditCardStatements,
  type CreditCardWithBalance,
} from '../services/credit-card-statements';

export interface UpdateCreditCardStatusInput {
  uuid: string;
  ownerId: number;
  status: RecordStatus;
}

@Injectable()
export class UpdateCreditCardStatusUseCase {
  constructor(
    @Inject(CREDIT_CARD_REPOSITORY)
    private readonly cardRepository: CreditCardRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
    private readonly statements: CreditCardStatements,
  ) {}

  async execute(
    input: UpdateCreditCardStatusInput,
  ): Promise<CreditCardWithBalance> {
    const updated = await this.transactionManager.runInTransaction(async () => {
      await this.cardRepository.lockOwnerCards(input.ownerId);

      const card = await findOwnedCreditCard(
        this.cardRepository,
        input.uuid,
        input.ownerId,
      );

      return this.cardRepository.update(card.withStatus(input.status));
    });

    return this.statements.withBalance(updated);
  }
}
