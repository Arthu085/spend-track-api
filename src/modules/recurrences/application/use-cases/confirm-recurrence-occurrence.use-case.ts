import { Inject, Injectable } from '@nestjs/common';
import {
  InactiveAccountError,
  assertNotBeforeOpening,
} from '@modules/accounts';
import { CreateCreditCardPurchaseUseCase } from '@modules/credit-cards';
import {
  INVESTMENT_MOVEMENT_REPOSITORY,
  InvestmentValues,
  type InvestmentMovementEntity,
  type InvestmentMovementRepository,
} from '@modules/investments';
import {
  TRANSACTION_REPOSITORY,
  type TransactionEntity,
  type TransactionRepository,
} from '@modules/transactions';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { financeToday } from '@shared/domain/calendar';
import { assertRecordActive } from '@shared/domain/policies';
import type { RecurrenceCardChargeEntity } from '../../domain/entities/recurrence-card-charge.entity';
import type { RecurrenceEntity } from '../../domain/entities/recurrence.entity';
import {
  RECURRENCE_CARD_CHARGE_REPOSITORY,
  type RecurrenceCardChargeRepository,
} from '../../domain/repositories/recurrence-card-charge.repository';
import {
  occurrenceOfCardCharge,
  occurrenceOfMovement,
  occurrenceOfTransaction,
  type RecurrenceOccurrence,
} from '../services/recurrence-occurrence';
import { RecurrenceOccurrences } from '../services/recurrence-occurrences';
import { RecurrenceReferences } from '../services/recurrence-references';

export interface ConfirmRecurrenceOccurrenceInput {
  uuid: string;
  occurrenceUuid: string;
  ownerId: number;
  amount?: number;
  date?: string;
}

@Injectable()
export class ConfirmRecurrenceOccurrenceUseCase {
  constructor(
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: TransactionRepository,
    @Inject(RECURRENCE_CARD_CHARGE_REPOSITORY)
    private readonly chargeRepository: RecurrenceCardChargeRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
    private readonly references: RecurrenceReferences,
    private readonly occurrences: RecurrenceOccurrences,
    private readonly createPurchase: CreateCreditCardPurchaseUseCase,
    @Inject(INVESTMENT_MOVEMENT_REPOSITORY)
    private readonly movementRepository: InvestmentMovementRepository,
    private readonly investmentValues: InvestmentValues,
  ) {}

  async execute(
    input: ConfirmRecurrenceOccurrenceInput,
  ): Promise<RecurrenceOccurrence> {
    return this.transactionManager.runInTransaction(async () => {
      await this.references.lockOwnerFinances(input.ownerId);

      const recurrence = await this.references.lockRecurrence(
        input.uuid,
        input.ownerId,
      );

      const occurrence = await this.occurrences.lockPlanned(
        recurrence,
        input.occurrenceUuid,
      );

      switch (occurrence.kind) {
        case 'transaction':
          return this.confirmTransaction(occurrence.transaction, input);
        case 'cardCharge':
          return this.confirmCardCharge(recurrence, occurrence.charge, input);
        case 'movement':
          return this.confirmMovement(recurrence, occurrence.movement, input);
      }
    });
  }

  private async confirmTransaction(
    transaction: TransactionEntity,
    input: ConfirmRecurrenceOccurrenceInput,
  ): Promise<RecurrenceOccurrence> {
    assertRecordActive(transaction.account, new InactiveAccountError());

    const completedOn = input.date ?? financeToday();

    assertNotBeforeOpening(
      [transaction.account],
      [transaction.date, completedOn],
    );

    const completed = transaction
      .withDetails({
        description: transaction.description,
        amount: input.amount ?? transaction.amount,
        date: transaction.date,
        account: transaction.account,
        destinationAccount: null,
        category: transaction.category,
        notes: transaction.notes,
      })
      .complete(completedOn);

    return occurrenceOfTransaction(
      await this.transactionRepository.update(completed),
    );
  }

  private async confirmMovement(
    recurrence: RecurrenceEntity,
    movement: InvestmentMovementEntity,
    input: ConfirmRecurrenceOccurrenceInput,
  ): Promise<RecurrenceOccurrence> {
    if (!movement.account || !recurrence.investment) {
      throw new Error('Contributions have an account and an investment');
    }

    assertRecordActive(movement.account, new InactiveAccountError());

    const completedOn = input.date ?? financeToday();

    assertNotBeforeOpening([movement.account], [movement.date, completedOn]);

    const completed = movement
      .withPlannedDetails({
        amount: input.amount ?? movement.amount,
        date: movement.date,
        account: movement.account,
      })
      .complete(completedOn);

    await this.investmentValues.assertCanChangeBy(
      recurrence.investment,
      completed.valueChange - movement.valueChange,
    );

    return occurrenceOfMovement(
      await this.movementRepository.update(completed),
      recurrence.description,
    );
  }

  private async confirmCardCharge(
    recurrence: RecurrenceEntity,
    charge: RecurrenceCardChargeEntity,
    input: ConfirmRecurrenceOccurrenceInput,
  ): Promise<RecurrenceOccurrence> {
    if (!recurrence.creditCard) {
      throw new Error('Card charges belong to card recurrences');
    }

    const amount = input.amount ?? charge.amount;
    const date = input.date ?? charge.date;

    const purchase = await this.createPurchase.recordPlannedCharge({
      ownerId: recurrence.ownerId,
      cardUuid: recurrence.creditCard.uuid,
      categoryUuid: charge.category.uuid,
      description: charge.description,
      amount,
      purchaseDate: date,
      installmentCount: 1,
      notes: recurrence.notes,
    });

    return occurrenceOfCardCharge(
      await this.chargeRepository.update(
        charge.complete(
          { id: purchase.id, uuid: purchase.uuid },
          {
            amount,
            date,
            invoiceMonth: purchase.installments[0].invoice.referenceMonth,
          },
        ),
      ),
    );
  }
}
