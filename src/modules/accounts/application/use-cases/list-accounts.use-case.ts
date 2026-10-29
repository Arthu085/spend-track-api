import { Inject, Injectable } from '@nestjs/common';
import { normalizeTextFilter } from '@shared/application/filters';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { AccountEntity } from '../../domain/entities/account.entity';
import { AccountType } from '../../domain/enums/account-type.enum';
import {
  ACCOUNT_REPOSITORY,
  type AccountRepository,
} from '../../domain/repositories/account.repository';

export interface ListAccountsInput {
  ownerId: number;
  name?: string;
  type?: AccountType;
  status?: RecordStatus;
}

@Injectable()
export class ListAccountsUseCase {
  constructor(
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: AccountRepository,
  ) {}

  async execute(input: ListAccountsInput): Promise<AccountEntity[]> {
    return this.accountRepository.findAllByOwner(input.ownerId, {
      name: normalizeTextFilter(input.name),
      type: input.type,
      status: input.status ?? RecordStatus.ACTIVE,
    });
  }
}
