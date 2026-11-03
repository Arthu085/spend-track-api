import {
  TransactionState,
  type TransactionEntity,
} from '@modules/transactions';
import type { RecurrenceCardChargeEntity } from '../../domain/entities/recurrence-card-charge.entity';

export interface RecurrenceOccurrence {
  uuid: string;
  occurrenceDate: string;
  date: string;
  amount: number;
  description: string;
  state: TransactionState;
  completedOn: string | null;
  transactionUuid: string | null;
  purchaseUuid: string | null;
  invoiceMonth: string | null;
}

export function occurrenceOfTransaction(
  transaction: TransactionEntity,
): RecurrenceOccurrence {
  return {
    uuid: transaction.uuid,
    occurrenceDate: transaction.recurrence?.occurrenceDate ?? transaction.date,
    date: transaction.date,
    amount: transaction.amount,
    description: transaction.description,
    state: transaction.state,
    completedOn: transaction.completedOn,
    transactionUuid: transaction.uuid,
    purchaseUuid: null,
    invoiceMonth: null,
  };
}

export function occurrenceOfCardCharge(
  charge: RecurrenceCardChargeEntity,
): RecurrenceOccurrence {
  return {
    uuid: charge.uuid,
    occurrenceDate: charge.occurrenceDate,
    date: charge.date,
    amount: charge.amount,
    description: charge.description,
    state: charge.state,
    completedOn:
      charge.state === TransactionState.COMPLETED ? charge.date : null,
    transactionUuid: null,
    purchaseUuid: charge.purchase?.uuid ?? null,
    invoiceMonth: charge.invoiceMonth,
  };
}
