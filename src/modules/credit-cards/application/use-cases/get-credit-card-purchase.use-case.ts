import { Inject, Injectable } from '@nestjs/common';
import { CreditCardPurchaseEntity } from '../../domain/entities/credit-card-purchase.entity';
import {
  CREDIT_CARD_PURCHASE_REPOSITORY,
  type CreditCardPurchaseRepository,
} from '../../domain/repositories/credit-card-purchase.repository';
import { findOwnedPurchase } from '../services/credit-card-references';

@Injectable()
export class GetCreditCardPurchaseUseCase {
  constructor(
    @Inject(CREDIT_CARD_PURCHASE_REPOSITORY)
    private readonly purchaseRepository: CreditCardPurchaseRepository,
  ) {}

  execute(uuid: string, ownerId: number): Promise<CreditCardPurchaseEntity> {
    return findOwnedPurchase(this.purchaseRepository, uuid, ownerId);
  }
}
