import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { BaseTransactionalRepository } from '@shared/infrastructure/persistence';
import { UserChangeRequestEntity } from '../../../domain/entities/user-change-request.entity';
import { UserChangeRequestStatus } from '../../../domain/enums/user-change-request-status.enum';
import type { UserChangeRequestRepository } from '../../../domain/repositories/user-change-request.repository';
import { UserChangeRequestOrmEntity } from '../entities/user-change-request.orm-entity';
import { UserChangeRequestMapper } from '../mappers/user-change-request.mapper';

@Injectable()
export class TypeOrmUserChangeRequestRepository
  extends BaseTransactionalRepository<UserChangeRequestOrmEntity>
  implements UserChangeRequestRepository
{
  constructor(
    @InjectRepository(UserChangeRequestOrmEntity)
    repository: Repository<UserChangeRequestOrmEntity>,
  ) {
    super(repository);
  }

  async create(
    request: UserChangeRequestEntity,
  ): Promise<UserChangeRequestEntity> {
    const saved = await this.repository.save(
      UserChangeRequestMapper.toOrm(request),
    );

    const reloaded = await this.hydratedQuery()
      .where('request.id = :id', { id: saved.id })
      .getOneOrFail();

    return UserChangeRequestMapper.toDomain(reloaded);
  }

  async findByUuid(uuid: string): Promise<UserChangeRequestEntity | null> {
    const row = await this.hydratedQuery()
      .where('request.uuid = :uuid', { uuid })
      .getOne();

    return row ? UserChangeRequestMapper.toDomain(row) : null;
  }

  async findPendingForUser(
    targetUserId: number,
    now: Date,
  ): Promise<UserChangeRequestEntity[]> {
    const rows = await this.hydratedQuery()
      .where('request.targetUserId = :targetUserId', { targetUserId })
      .andWhere('request.status = :status', {
        status: UserChangeRequestStatus.PENDING,
      })
      .andWhere('request.expiresAt > :now', { now })
      .orderBy('request.id', 'DESC')
      .getMany();

    return rows.map((row) => UserChangeRequestMapper.toDomain(row));
  }

  async saveDecision(request: UserChangeRequestEntity): Promise<void> {
    await this.repository.update(
      { id: request.id },
      { status: request.status, decidedAt: request.decidedAt },
    );
  }

  async supersedePendingForUser(targetUserId: number): Promise<void> {
    await this.repository.update(
      { targetUserId, status: UserChangeRequestStatus.PENDING },
      { status: UserChangeRequestStatus.SUPERSEDED, decidedAt: new Date() },
    );
  }

  async supersedePendingInvolving(userId: number): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .update()
      .set({
        status: UserChangeRequestStatus.SUPERSEDED,
        decidedAt: new Date(),
      })
      .where('status = :status', { status: UserChangeRequestStatus.PENDING })
      .andWhere('(target_user_id = :userId OR requested_by = :userId)', {
        userId,
      })
      .execute();
  }

  private hydratedQuery(): SelectQueryBuilder<UserChangeRequestOrmEntity> {
    return this.repository
      .createQueryBuilder('request')
      .leftJoin('request.requester', 'requester')
      .addSelect(['requester.id', 'requester.name'])
      .leftJoinAndSelect('request.currentRoles', 'currentRole')
      .leftJoinAndSelect('request.requestedRoles', 'requestedRole')
      .withDeleted();
  }
}
