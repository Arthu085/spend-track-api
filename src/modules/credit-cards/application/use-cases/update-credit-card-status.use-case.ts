import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { PendingOperationsDecision } from '@shared/domain/pending-operations';
import type { CreditCardEntity } from '../../domain/entities/credit-card.entity';
import { CreditCardPendingOperationsDecisionRequiredError } from '../../domain/errors/credit-card-pending-operations-decision-required.error';
import {
  CREDIT_CARD_REPOSITORY,
  type CreditCardRepository,
} from '../../domain/repositories/credit-card.repository';
import {
  CREDIT_CARD_PENDING_OPERATIONS,
  type CreditCardPendingOperations,
} from '../ports/credit-card-pending-operations.port';
import { findOwnedCreditCard } from '../services/credit-card-references';
import {
  CreditCardStatements,
  type CreditCardWithBalance,
} from '../services/credit-card-statements';

export interface UpdateCreditCardStatusInput {
  uuid: string;
  ownerId: number;
  status: RecordStatus;
  pendingOperations?: PendingOperationsDecision;
}

@Injectable()
export class UpdateCreditCardStatusUseCase {
  constructor(
    @Inject(CREDIT_CARD_REPOSITORY)
    private readonly cardRepository: CreditCardRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
    private readonly statements: CreditCardStatements,
    @Inject(CREDIT_CARD_PENDING_OPERATIONS)
    private readonly pendingOperations: CreditCardPendingOperations,
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

      if (
        card.status === RecordStatus.ACTIVE &&
        input.status === RecordStatus.INACTIVE
      ) {
        await this.settlePendingOperations(card, input.pendingOperations);
      }

      return this.cardRepository.update(card.withStatus(input.status));
    });

    return this.statements.withBalance(updated);
  }

  private async settlePendingOperations(
    card: CreditCardEntity,
    decision: PendingOperationsDecision | undefined,
  ): Promise<void> {
    if (decision === PendingOperationsDecision.CANCEL) {
      await this.pendingOperations.cancel(card.ownerId, card.id);

      return;
    }

    if (decision === PendingOperationsDecision.KEEP) {
      return;
    }

    const { count } = await this.pendingOperations.summarize(
      card.ownerId,
      card.id,
    );

    if (count > 0) {
      throw new CreditCardPendingOperationsDecisionRequiredError();
    }
  }
}
