import { Inject, Injectable } from '@nestjs/common';
import type { AccountEntity } from '@modules/accounts';
import { financeToday } from '@shared/domain/calendar';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import type { TransactionEntity } from '../../domain/entities/transaction.entity';
import { ConfirmationBlockedReason } from '../../domain/enums/confirmation-blocked-reason.enum';
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepository,
} from '../../domain/repositories/transaction.repository';

export interface PendingConfirmation {
  transaction: TransactionEntity;
  overdue: boolean;
  future: boolean;
  blockedReason: ConfirmationBlockedReason | null;
  earliestCompletedOn: string;
}

function accountsOf(transaction: TransactionEntity): AccountEntity[] {
  return transaction.destinationAccount
    ? [transaction.account, transaction.destinationAccount]
    : [transaction.account];
}

function latestOpeningOf(accounts: readonly AccountEntity[]): string {
  return accounts
    .map(({ openingBalanceDate }) => openingBalanceDate)
    .reduce((latest, date) => (date > latest ? date : latest));
}

function blockedReasonOf(
  transaction: TransactionEntity,
  latestOpening: string,
  today: string,
): ConfirmationBlockedReason | null {
  if (
    accountsOf(transaction).some(
      (account) => account.status !== RecordStatus.ACTIVE,
    )
  ) {
    return ConfirmationBlockedReason.INACTIVE_ACCOUNT;
  }

  return today < latestOpening || transaction.date < latestOpening
    ? ConfirmationBlockedReason.BEFORE_ACCOUNT_OPENING
    : null;
}

@Injectable()
export class ListPendingConfirmationsUseCase {
  constructor(
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: TransactionRepository,
  ) {}

  async execute(
    ownerId: number,
    until: string,
  ): Promise<PendingConfirmation[]> {
    const today = financeToday();

    const transactions = await this.transactionRepository.findAllPlannedUntil(
      ownerId,
      until,
    );

    return transactions.map((transaction) => {
      const earliestCompletedOn = latestOpeningOf(accountsOf(transaction));

      return {
        transaction,
        overdue: transaction.date < today,
        future: transaction.date > today,
        blockedReason: blockedReasonOf(transaction, earliestCompletedOn, today),
        earliestCompletedOn,
      };
    });
  }
}
