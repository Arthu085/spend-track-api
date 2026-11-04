import type { AccountEntity } from '../entities/account.entity';
import { AccountOperationBeforeOpeningError } from '../errors/account-operation-before-opening.error';

export function assertNotBeforeOpening(
  accounts: readonly (AccountEntity | null)[],
  dates: readonly (string | null | undefined)[],
): void {
  for (const account of accounts) {
    for (const date of dates) {
      if (account && date && date < account.openingBalanceDate) {
        throw new AccountOperationBeforeOpeningError();
      }
    }
  }
}
