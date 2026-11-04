import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  CREDIT_CARD_PENDING_OPERATIONS,
  type CreditCardPendingOperations,
  type CreditCardPendingOperationsRegistry,
} from '@modules/credit-cards';
import {
  summarizePendingOperations,
  type PendingOperationsSummary,
} from '@shared/domain/pending-operations';
import {
  RECURRENCE_CARD_CHARGE_REPOSITORY,
  type RecurrenceCardChargeRepository,
} from '../../domain/repositories/recurrence-card-charge.repository';

@Injectable()
export class RecurrenceCardChargePendingOperations
  implements CreditCardPendingOperations, OnModuleInit
{
  constructor(
    @Inject(RECURRENCE_CARD_CHARGE_REPOSITORY)
    private readonly chargeRepository: RecurrenceCardChargeRepository,
    @Inject(CREDIT_CARD_PENDING_OPERATIONS)
    private readonly registry: CreditCardPendingOperationsRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async summarize(
    ownerId: number,
    cardId: number,
  ): Promise<PendingOperationsSummary> {
    const planned = await this.chargeRepository.findPlannedByCard(
      ownerId,
      cardId,
    );

    return summarizePendingOperations(planned.map(({ amount }) => amount));
  }

  async cancel(ownerId: number, cardId: number): Promise<void> {
    for (const charge of await this.chargeRepository.findPlannedByCard(
      ownerId,
      cardId,
    )) {
      await this.chargeRepository.update(charge.cancel());
    }
  }
}
