import { Inject, Injectable } from '@nestjs/common';
import { assertRecordActive } from '@shared/domain/policies';
import { AccountEntity } from '../../domain/entities/account.entity';
import { InactiveAccountError } from '../../domain/errors/inactive-account.error';
import {
  ACCOUNT_REPOSITORY,
  type AccountRepository,
} from '../../domain/repositories/account.repository';
import {
  ACCOUNT_LEDGERS,
  type AccountLedger,
} from '../ports/account-ledger.port';
import { findOwnedAccount } from '../services/find-owned-account';
import { withCurrentBalance } from '../services/with-current-balances';

@Injectable()
export class GetAccountUseCase {
  constructor(
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: AccountRepository,
    @Inject(ACCOUNT_LEDGERS)
    private readonly accountLedger: AccountLedger,
  ) {}

  async execute(uuid: string, ownerId: number): Promise<AccountEntity> {
    const account = await findOwnedAccount(
      this.accountRepository,
      uuid,
      ownerId,
    );

    assertRecordActive(account, new InactiveAccountError());

    return withCurrentBalance(this.accountLedger, account);
  }
}
