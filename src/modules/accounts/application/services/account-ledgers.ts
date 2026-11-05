import { Injectable } from '@nestjs/common';
import type {
  AccountLedger,
  AccountLedgerRegistry,
} from '../ports/account-ledger.port';

@Injectable()
export class AccountLedgers implements AccountLedgerRegistry {
  private readonly ledgers: AccountLedger[] = [];

  register(ledger: AccountLedger): void {
    this.ledgers.push(ledger);
  }

  async balanceChanges(
    ownerId: number,
    accountIds: readonly number[],
  ): Promise<Map<number, number>> {
    const totals = new Map<number, number>();

    for (const ledger of this.ledgers) {
      const changes = await ledger.balanceChanges(ownerId, accountIds);

      for (const [accountId, change] of changes) {
        totals.set(accountId, (totals.get(accountId) ?? 0) + change);
      }
    }

    return totals;
  }

  async hasEntries(ownerId: number, accountId: number): Promise<boolean> {
    for (const ledger of this.ledgers) {
      if (await ledger.hasEntries(ownerId, accountId)) {
        return true;
      }
    }

    return false;
  }

  async earliestEntryDate(
    ownerId: number,
    accountId: number,
  ): Promise<string | null> {
    let earliest: string | null = null;

    for (const ledger of this.ledgers) {
      const date = await ledger.earliestEntryDate(ownerId, accountId);

      if (date !== null && (earliest === null || date < earliest)) {
        earliest = date;
      }
    }

    return earliest;
  }

  async latestHistoricalEntryDate(
    ownerId: number,
    accountId: number,
  ): Promise<string | null> {
    let latest: string | null = null;

    for (const ledger of this.ledgers) {
      const date = await ledger.latestHistoricalEntryDate(ownerId, accountId);

      if (date !== null && (latest === null || date > latest)) {
        latest = date;
      }
    }

    return latest;
  }
}
