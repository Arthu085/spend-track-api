import { Inject, Injectable } from '@nestjs/common';
import { assertRecordActive } from '@shared/domain/policies';
import { AccountEntity } from '../../domain/entities/account.entity';
import { InactiveAccountError } from '../../domain/errors/inactive-account.error';
import {
  ACCOUNT_REPOSITORY,
  type AccountRepository,
} from '../../domain/repositories/account.repository';
import { findOwnedAccount } from '../services/find-owned-account';

@Injectable()
export class GetAccountUseCase {
  constructor(
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: AccountRepository,
  ) {}

  async execute(uuid: string, ownerId: number): Promise<AccountEntity> {
    const account = await findOwnedAccount(
      this.accountRepository,
      uuid,
      ownerId,
    );

    assertRecordActive(account, new InactiveAccountError());

    return account;
  }
}
