import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { AccountEntity } from '../entities/account.entity';
import { AccountType } from '../enums/account-type.enum';

export const ACCOUNT_REPOSITORY = Symbol('ACCOUNT_REPOSITORY');

export interface PaginatedAccounts {
  items: AccountEntity[];
  total: number;
}

export interface AccountListFilters {
  name?: string;
  type?: AccountType;
  status?: RecordStatus;
}

export interface AccountRepository {
  findAllByOwner(
    ownerId: number,
    filters?: AccountListFilters,
  ): Promise<AccountEntity[]>;
  findAllPaginatedByOwner(
    ownerId: number,
    offset: number,
    limit: number,
    filters?: AccountListFilters,
  ): Promise<PaginatedAccounts>;
  findByUuidForOwner(
    uuid: string,
    ownerId: number,
  ): Promise<AccountEntity | null>;
  lockOwnerAccounts(ownerId: number): Promise<void>;
  clearDefault(ownerId: number): Promise<void>;
  create(account: AccountEntity): Promise<AccountEntity>;
  update(account: AccountEntity): Promise<AccountEntity>;
  softDelete(account: AccountEntity): Promise<void>;
}
