import type { PendingOperationsSummary } from '@shared/domain/pending-operations';

export const CREDIT_CARD_PENDING_OPERATIONS = Symbol(
  'CREDIT_CARD_PENDING_OPERATIONS',
);

export interface CreditCardPendingOperations {
  summarize(ownerId: number, cardId: number): Promise<PendingOperationsSummary>;
  cancel(ownerId: number, cardId: number): Promise<void>;
}

export interface CreditCardPendingOperationsRegistry extends CreditCardPendingOperations {
  register(source: CreditCardPendingOperations): void;
}
