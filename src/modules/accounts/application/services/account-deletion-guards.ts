import { Injectable } from '@nestjs/common';

export interface AccountDeletionGuard {
  assertCanDelete(ownerId: number, accountId: number): Promise<void>;
}

@Injectable()
export class AccountDeletionGuards implements AccountDeletionGuard {
  private readonly guards: AccountDeletionGuard[] = [];

  register(guard: AccountDeletionGuard): void {
    this.guards.push(guard);
  }

  async assertCanDelete(ownerId: number, accountId: number): Promise<void> {
    for (const guard of this.guards) {
      await guard.assertCanDelete(ownerId, accountId);
    }
  }
}
