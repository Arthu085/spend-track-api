import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BaseTransactionalRepository,
  applyExactFilter,
  applyILikeFilter,
} from '@shared/infrastructure/persistence';
import { AccountEntity } from '../../../domain/entities/account.entity';
import type {
  AccountListFilters,
  AccountRepository,
} from '../../../domain/repositories/account.repository';
import { AccountOrmEntity } from '../entities/account.orm-entity';
import { AccountMapper } from '../mappers/account.mapper';

const OWNER_ACCOUNTS_LOCK_NAMESPACE = 672502;

@Injectable()
export class TypeOrmAccountRepository
  extends BaseTransactionalRepository<AccountOrmEntity>
  implements AccountRepository
{
  constructor(
    @InjectRepository(AccountOrmEntity)
    repository: Repository<AccountOrmEntity>,
  ) {
    super(repository);
  }

  async findAllByOwner(
    ownerId: number,
    filters: AccountListFilters = {},
  ): Promise<AccountEntity[]> {
    const qb = this.repository
      .createQueryBuilder('account')
      .where('account.userId = :ownerId', { ownerId })
      .orderBy('account.isDefault', 'DESC')
      .addOrderBy('account.name', 'ASC')
      .addOrderBy('account.id', 'ASC');

    applyILikeFilter(qb, 'account.name', 'name', filters.name);
    applyExactFilter(qb, 'account.type', 'type', filters.type);
    applyExactFilter(qb, 'account.status', 'status', filters.status);

    const rows = await qb.getMany();

    return rows.map((row) => AccountMapper.toDomain(row));
  }

  async findByUuidForOwner(
    uuid: string,
    ownerId: number,
  ): Promise<AccountEntity | null> {
    const row = await this.repository.findOne({
      where: { uuid, userId: ownerId },
    });

    return row ? AccountMapper.toDomain(row) : null;
  }

  async lockOwnerAccounts(ownerId: number): Promise<void> {
    await this.repository.query('SELECT pg_advisory_xact_lock($1, $2)', [
      OWNER_ACCOUNTS_LOCK_NAMESPACE,
      ownerId,
    ]);
  }

  async clearDefault(ownerId: number): Promise<void> {
    await this.repository.update(
      { userId: ownerId, isDefault: true },
      { isDefault: false },
    );
  }

  async create(account: AccountEntity): Promise<AccountEntity> {
    return this.saveAndReload(account);
  }

  async update(account: AccountEntity): Promise<AccountEntity> {
    return this.saveAndReload(account);
  }

  async softDelete(account: AccountEntity): Promise<void> {
    await this.repository.update(
      { id: account.id },
      { isDefault: false, deletedAt: new Date() },
    );
  }

  private async saveAndReload(account: AccountEntity): Promise<AccountEntity> {
    const saved = await this.repository.save(AccountMapper.toOrm(account));

    return AccountMapper.toDomain(
      await this.repository.findOneOrFail({ where: { id: saved.id } }),
    );
  }
}
