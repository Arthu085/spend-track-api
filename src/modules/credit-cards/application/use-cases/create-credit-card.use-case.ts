import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import {
  CreditCardEntity,
  type CreditCardDetails,
} from '../../domain/entities/credit-card.entity';
import {
  CREDIT_CARD_REPOSITORY,
  type CreditCardRepository,
} from '../../domain/repositories/credit-card.repository';
import {
  CreditCardStatements,
  type CreditCardWithBalance,
} from '../services/credit-card-statements';

export interface CreateCreditCardInput extends CreditCardDetails {
  ownerId: number;
  isDefault: boolean;
}

@Injectable()
export class CreateCreditCardUseCase {
  constructor(
    @Inject(CREDIT_CARD_REPOSITORY)
    private readonly cardRepository: CreditCardRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
    private readonly statements: CreditCardStatements,
  ) {}

  async execute(input: CreateCreditCardInput): Promise<CreditCardWithBalance> {
    const card = await this.transactionManager.runInTransaction(async () => {
      await this.cardRepository.lockOwnerCards(input.ownerId);

      if (input.isDefault) {
        await this.cardRepository.clearDefault(input.ownerId);
      }

      return this.cardRepository.create(
        CreditCardEntity.create({ ...input, uuid: randomUUID() }),
      );
    });

    return this.statements.withBalance(card);
  }
}
