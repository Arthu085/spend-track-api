import { Injectable } from '@nestjs/common';
import type { PendingOperationsDecision } from '@shared/domain/pending-operations';

export interface InvestmentLifecycleParticipant {
  assertCanDelete(ownerId: number, investmentId: number): Promise<void>;
  archive(
    ownerId: number,
    investmentId: number,
    decision: PendingOperationsDecision | undefined,
  ): Promise<void>;
}

@Injectable()
export class InvestmentLifecycle implements InvestmentLifecycleParticipant {
  private readonly participants: InvestmentLifecycleParticipant[] = [];

  register(participant: InvestmentLifecycleParticipant): void {
    this.participants.push(participant);
  }

  async assertCanDelete(ownerId: number, investmentId: number): Promise<void> {
    for (const participant of this.participants) {
      await participant.assertCanDelete(ownerId, investmentId);
    }
  }

  async archive(
    ownerId: number,
    investmentId: number,
    decision: PendingOperationsDecision | undefined,
  ): Promise<void> {
    for (const participant of this.participants) {
      await participant.archive(ownerId, investmentId, decision);
    }
  }
}
