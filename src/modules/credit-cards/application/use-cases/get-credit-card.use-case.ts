import { Inject, Injectable } from '@nestjs/common';
import { assertRecordActive } from '@shared/domain/policies';
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

@Injectable()
export class GetCreditCardUseCase {
  constructor(
    @Inject(CREDIT_CARD_REPOSITORY)
    private readonly cardRepository: CreditCardRepository,
    private readonly statements: CreditCardStatements,
  ) {}

  async execute(uuid: string, ownerId: number): Promise<CreditCardWithBalance> {
    const card = await findOwnedCreditCard(this.cardRepository, uuid, ownerId);

    assertRecordActive(card, new InactiveCreditCardError());

    return this.statements.withBalance(card);
  }
}
