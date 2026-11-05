import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, type SelectQueryBuilder } from 'typeorm';
import {
  BaseTransactionalRepository,
  applyExactFilter,
  applyILikeFilter,
} from '@shared/infrastructure/persistence';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { RecurrenceEntity } from '../../../domain/entities/recurrence.entity';
import { RecurrenceState } from '../../../domain/enums/recurrence-state.enum';
import type {
  PaginatedRecurrences,
  RecurrenceKey,
  RecurrenceListFilters,
  RecurrenceRepository,
} from '../../../domain/repositories/recurrence.repository';
import { RecurrenceOrmEntity } from '../entities/recurrence.orm-entity';
import { RecurrenceMapper } from '../mappers/recurrence.mapper';

interface RecurrenceKeyRow {
  uuid: string;
  ownerId: number;
}

@Injectable()
export class TypeOrmRecurrenceRepository
  extends BaseTransactionalRepository<RecurrenceOrmEntity>
  implements RecurrenceRepository
{
  constructor(
    @InjectRepository(RecurrenceOrmEntity)
    repository: Repository<RecurrenceOrmEntity>,
  ) {
    super(repository);
  }

  async findAllPaginatedByOwner(
    ownerId: number,
    offset: number,
    limit: number,
    today: string,
    filters: RecurrenceListFilters = {},
  ): Promise<PaginatedRecurrences> {
    const qb = this.ownerQuery(ownerId)
      .orderBy('recurrence.description', 'ASC')
      .addOrderBy('recurrence.id', 'ASC')
      .skip(offset)
      .take(limit);

    applyExactFilter(qb, 'recurrence.type', 'type', filters.type);
    applyILikeFilter(
      qb,
      'recurrence.description',
      'description',
      filters.description,
    );

    if (filters.state === RecurrenceState.ENDED) {
      qb.andWhere(
        new Brackets((either) =>
          either
            .where('recurrence.state = :ended')
            .orWhere('recurrence.endDate < :today'),
        ),
        { ended: RecurrenceState.ENDED, today },
      );
    } else if (filters.state) {
      qb.andWhere('recurrence.state = :state', { state: filters.state });
      qb.andWhere(
        new Brackets((either) =>
          either
            .where('recurrence.endDate IS NULL')
            .orWhere('recurrence.endDate >= :today'),
        ),
        { today },
      );
    }

    const [rows, total] = await qb.getManyAndCount();

    return { items: rows.map((row) => RecurrenceMapper.toDomain(row)), total };
  }

  async findByUuidForOwner(
    uuid: string,
    ownerId: number,
  ): Promise<RecurrenceEntity | null> {
    const row = await this.ownerQuery(ownerId)
      .andWhere('recurrence.uuid = :uuid', { uuid })
      .getOne();

    return row ? RecurrenceMapper.toDomain(row) : null;
  }

  async findByUuidForOwnerForUpdate(
    uuid: string,
    ownerId: number,
  ): Promise<RecurrenceEntity | null> {
    await this.repository
      .createQueryBuilder('recurrence')
      .select('recurrence.id')
      .where('recurrence.uuid = :uuid', { uuid })
      .andWhere('recurrence.userId = :ownerId', { ownerId })
      .setLock('for_no_key_update')
      .getOne();

    return this.findByUuidForOwner(uuid, ownerId);
  }

  async findOpenByTarget(
    ownerId: number,
    target: { accountId: number } | { investmentId: number },
    today: string,
  ): Promise<RecurrenceEntity[]> {
    const qb = this.ownerQuery(ownerId)
      .andWhere('recurrence.state IN (:...states)', {
        states: [RecurrenceState.ACTIVE, RecurrenceState.PAUSED],
      })
      .andWhere(
        '(recurrence.endDate IS NULL OR recurrence.endDate >= :today)',
        { today },
      );

    if ('accountId' in target) {
      qb.andWhere('recurrence.accountId = :targetId', {
        targetId: target.accountId,
      });
    } else {
      qb.andWhere('recurrence.investmentId = :targetId', {
        targetId: target.investmentId,
      });
    }

    return (await qb.orderBy('recurrence.id', 'ASC').getMany()).map((row) =>
      RecurrenceMapper.toDomain(row),
    );
  }

  async findWithSavingStrategyByOwner(
    ownerId: number,
  ): Promise<RecurrenceEntity[]> {
    const rows = await this.ownerQuery(ownerId)
      .andWhere('recurrence.additionalContributionStrategy IS NOT NULL')
      .orderBy('recurrence.description', 'ASC')
      .addOrderBy('recurrence.id', 'ASC')
      .getMany();

    return rows.map((row) => RecurrenceMapper.toDomain(row));
  }

  async findDueForGeneration(
    through: string,
    today: string,
    limit: number,
  ): Promise<RecurrenceKey[]> {
    const rows = await this.repository
      .createQueryBuilder('recurrence')
      .leftJoin('recurrence.account', 'account')
      .leftJoin('recurrence.creditCard', 'creditCard')
      .leftJoin('recurrence.investment', 'investment')
      .select('recurrence.uuid', 'uuid')
      .addSelect('recurrence.userId', 'ownerId')
      .where('recurrence.state = :state', { state: RecurrenceState.ACTIVE })
      .andWhere(
        new Brackets((either) =>
          either
            .where(
              'account.status = :activeAccount AND account.deletedAt IS NULL',
            )
            .orWhere(
              'creditCard.status = :activeCard AND creditCard.deletedAt IS NULL',
            ),
        ),
        { activeAccount: RecordStatus.ACTIVE, activeCard: RecordStatus.ACTIVE },
      )
      .andWhere(
        new Brackets((either) =>
          either
            .where('recurrence.investmentId IS NULL')
            .orWhere(
              'investment.status = :activeInvestment AND investment.deletedAt IS NULL',
            ),
        ),
        { activeInvestment: RecordStatus.ACTIVE },
      )
      .andWhere('recurrence.startDate <= :through', { through })
      .andWhere(
        new Brackets((either) =>
          either
            .where('recurrence.endDate IS NULL')
            .orWhere('recurrence.endDate >= :today'),
        ),
        { today },
      )
      .andWhere(
        new Brackets((either) =>
          either
            .where('recurrence.generatedThrough IS NULL')
            .orWhere(
              'recurrence.generatedThrough < LEAST(CAST(:through AS date), COALESCE(recurrence.endDate, CAST(:through AS date)))',
            ),
        ),
        { through },
      )
      .orderBy('recurrence.id', 'ASC')
      .limit(limit)
      .getRawMany<RecurrenceKeyRow>();

    return rows.map((row) => ({
      uuid: row.uuid,
      ownerId: Number(row.ownerId),
    }));
  }

  async create(recurrence: RecurrenceEntity): Promise<RecurrenceEntity> {
    return this.saveAndReload(recurrence);
  }

  async update(recurrence: RecurrenceEntity): Promise<RecurrenceEntity> {
    return this.saveAndReload(recurrence);
  }

  private ownerQuery(ownerId: number): SelectQueryBuilder<RecurrenceOrmEntity> {
    return this.repository
      .createQueryBuilder('recurrence')
      .withDeleted()
      .leftJoinAndSelect('recurrence.account', 'account')
      .leftJoinAndSelect('recurrence.creditCard', 'creditCard')
      .leftJoinAndSelect('recurrence.investment', 'investment')
      .leftJoinAndSelect('recurrence.category', 'category')
      .where('recurrence.userId = :ownerId', { ownerId })
      .andWhere('recurrence.deletedAt IS NULL');
  }

  private async saveAndReload(
    recurrence: RecurrenceEntity,
  ): Promise<RecurrenceEntity> {
    const saved = await this.repository.save(
      RecurrenceMapper.toOrm(recurrence),
    );

    const reloaded = await this.ownerQuery(recurrence.ownerId)
      .andWhere('recurrence.id = :id', { id: saved.id })
      .getOneOrFail();

    return RecurrenceMapper.toDomain(reloaded);
  }
}
