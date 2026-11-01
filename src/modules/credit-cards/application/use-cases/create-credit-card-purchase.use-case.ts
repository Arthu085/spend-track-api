import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_CATEGORY_REPOSITORY,
  type TransactionCategoryRepository,
} from '@modules/transaction-categories';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { addMonthsToDate } from '@shared/domain/calendar';
import { splitInstallments } from '../../domain/billing/split-installments';
import { CreditCardPurchaseEntity } from '../../domain/entities/credit-card-purchase.entity';
import { CreditCardInstallmentsExceedAmountError } from '../../domain/errors/credit-card-installments-exceed-amount.error';
import {
  CREDIT_CARD_PURCHASE_REPOSITORY,
  type CreditCardPurchaseRepository,
} from '../../domain/repositories/credit-card-purchase.repository';
import {
  CREDIT_CARD_REPOSITORY,
  type CreditCardRepository,
} from '../../domain/repositories/credit-card.repository';
import { CreditCardInvoiceAssigner } from '../services/credit-card-invoice-assigner';
import {
  findActiveCreditCard,
  findActiveExpenseCategory,
} from '../services/credit-card-references';

export interface CreateCreditCardPurchaseInput {
  ownerId: number;
  cardUuid: string;
  categoryUuid: string;
  description: string;
  amount: number;
  purchaseDate: string;
  installmentCount: number;
  notes?: string | null;
}

@Injectable()
export class CreateCreditCardPurchaseUseCase {
  constructor(
    @Inject(CREDIT_CARD_PURCHASE_REPOSITORY)
    private readonly purchaseRepository: CreditCardPurchaseRepository,
    @Inject(CREDIT_CARD_REPOSITORY)
    private readonly cardRepository: CreditCardRepository,
    @Inject(TRANSACTION_CATEGORY_REPOSITORY)
    private readonly categoryRepository: TransactionCategoryRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
    private readonly invoiceAssigner: CreditCardInvoiceAssigner,
  ) {}

  async execute(
    input: CreateCreditCardPurchaseInput,
  ): Promise<CreditCardPurchaseEntity> {
    if (input.amount < input.installmentCount) {
      throw new CreditCardInstallmentsExceedAmountError();
    }

    return this.transactionManager.runInTransaction(async () => {
      await this.cardRepository.lockOwnerCards(input.ownerId);

      const card = await findActiveCreditCard(
        this.cardRepository,
        input.cardUuid,
        input.ownerId,
      );

      const category = await findActiveExpenseCategory(
        this.categoryRepository,
        input.categoryUuid,
        input.ownerId,
      );

      const invoices = await this.invoiceAssigner.invoicesFrom(
        card,
        input.purchaseDate,
        input.installmentCount,
      );

      const amounts = splitInstallments(input.amount, input.installmentCount);

      return this.purchaseRepository.create(
        CreditCardPurchaseEntity.create({
          uuid: randomUUID(),
          ownerId: input.ownerId,
          card,
          category,
          description: input.description,
          amount: input.amount,
          purchaseDate: input.purchaseDate,
          notes: input.notes ?? null,
          installments: invoices.map((invoice, index) => ({
            number: index + 1,
            amount: amounts[index],
            date: addMonthsToDate(input.purchaseDate, index),
            invoice,
          })),
        }),
      );
    });
  }
}
