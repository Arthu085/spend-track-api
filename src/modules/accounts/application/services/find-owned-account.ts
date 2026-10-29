import { AccountEntity } from '../../domain/entities/account.entity';
import { AccountNotFoundError } from '../../domain/errors/account-not-found.error';
import type { AccountRepository } from '../../domain/repositories/account.repository';

export async function findOwnedAccount(
  accountRepository: AccountRepository,
  uuid: string,
  ownerId: number,
): Promise<AccountEntity> {
  const account = await accountRepository.findByUuidForOwner(uuid, ownerId);

  if (!account) {
    throw new AccountNotFoundError();
  }

  return account;
}
