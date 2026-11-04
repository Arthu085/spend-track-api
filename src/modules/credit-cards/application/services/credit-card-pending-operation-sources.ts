import { Injectable } from '@nestjs/common';
import type { PendingOperationsSummary } from '@shared/domain/pending-operations';
import type {
  CreditCardPendingOperations,
  CreditCardPendingOperationsRegistry,
} from '../ports/credit-card-pending-operations.port';

@Injectable()
export class CreditCardPendingOperationSources implements CreditCardPendingOperationsRegistry {
  private readonly sources: CreditCardPendingOperations[] = [];

  register(source: CreditCardPendingOperations): void {
    this.sources.push(source);
  }

  async summarize(
    ownerId: number,
    cardId: number,
  ): Promise<PendingOperationsSummary> {
    const summary: PendingOperationsSummary = { count: 0, total: 0 };

    for (const source of this.sources) {
      const { count, total } = await source.summarize(ownerId, cardId);

      summary.count += count;
      summary.total += total;
    }

    return summary;
  }

  async cancel(ownerId: number, cardId: number): Promise<void> {
    for (const source of this.sources) {
      await source.cancel(ownerId, cardId);
    }
  }
}
