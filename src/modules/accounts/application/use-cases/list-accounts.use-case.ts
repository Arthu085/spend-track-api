import { Inject, Injectable } from '@nestjs/common';
import { PaginatedResult } from '@shared/application/dto';
import { normalizeTextFilter } from '@shared/application/filters';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { AccountEntity } from '../../domain/entities/account.entity';
import { AccountType } from '../../domain/enums/account-type.enum';
import {
  ACCOUNT_REPOSITORY,
  type AccountRepository,
} from '../../domain/repositories/account.repository';
import {
  ACCOUNT_LEDGERS,
  type AccountLedger,
} from '../ports/account-ledger.port';
import { withCurrentBalances } from '../services/with-current-balances';

export interface ListAccountsInput {
  ownerId: number;
  page: number;
  limit: number;
  name?: string;
  type?: AccountType;
  status?: RecordStatus;
}

@Injectable()
export class ListAccountsUseCase {
  constructor(
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: AccountRepository,
    @Inject(ACCOUNT_LEDGERS)
    private readonly accountLedger: AccountLedger,
  ) {}

  async execute(
    input: ListAccountsInput,
  ): Promise<PaginatedResult<AccountEntity>> {
    const { items, total } =
      await this.accountRepository.findAllPaginatedByOwner(
        input.ownerId,
        (input.page - 1) * input.limit,
        input.limit,
        {
          name: normalizeTextFilter(input.name),
          type: input.type,
          status: input.status ?? RecordStatus.ACTIVE,
        },
      );

    return PaginatedResult.of(
      await withCurrentBalances(this.accountLedger, input.ownerId, items),
      total,
      input.page,
      input.limit,
    );
  }
}
