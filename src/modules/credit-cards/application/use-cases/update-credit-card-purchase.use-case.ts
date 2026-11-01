import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_CATEGORY_REPOSITORY,
  type TransactionCategoryRepository,
} from '@modules/transaction-categories';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { CreditCardPurchaseEntity } from '../../domain/entities/credit-card-purchase.entity';
import {
  CREDIT_CARD_PURCHASE_REPOSITORY,
  type CreditCardPurchaseRepository,
} from '../../domain/repositories/credit-card-purchase.repository';
import {
  CREDIT_CARD_REPOSITORY,
  type CreditCardRepository,
} from '../../domain/repositories/credit-card.repository';
import {
  findActiveExpenseCategory,
  findOwnedPurchase,
} from '../services/credit-card-references';

export interface UpdateCreditCardPurchaseInput {
  uuid: string;
  ownerId: number;
  description?: string;
  categoryUuid?: string;
  notes?: string | null;
}

@Injectable()
export class UpdateCreditCardPurchaseUseCase {
  constructor(
    @Inject(CREDIT_CARD_PURCHASE_REPOSITORY)
    private readonly purchaseRepository: CreditCardPurchaseRepository,
    @Inject(CREDIT_CARD_REPOSITORY)
    private readonly cardRepository: CreditCardRepository,
    @Inject(TRANSACTION_CATEGORY_REPOSITORY)
    private readonly categoryRepository: TransactionCategoryRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
  ) {}

  async execute(
    input: UpdateCreditCardPurchaseInput,
  ): Promise<CreditCardPurchaseEntity> {
    return this.transactionManager.runInTransaction(async () => {
      await this.cardRepository.lockOwnerCards(input.ownerId);

      const purchase = await findOwnedPurchase(
        this.purchaseRepository,
        input.uuid,
        input.ownerId,
      );

      const category =
        input.categoryUuid === undefined ||
        input.categoryUuid === purchase.category.uuid
          ? purchase.category
          : await findActiveExpenseCategory(
              this.categoryRepository,
              input.categoryUuid,
              input.ownerId,
            );

      return this.purchaseRepository.update(
        purchase.withDetails({
          description: input.description ?? purchase.description,
          category,
          notes: input.notes === undefined ? purchase.notes : input.notes,
        }),
      );
    });
  }
}
