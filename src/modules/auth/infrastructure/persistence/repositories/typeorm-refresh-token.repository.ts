import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, MoreThan, Repository } from 'typeorm';
import { BaseTransactionalRepository } from '@shared/infrastructure/persistence';
import { RefreshTokenEntity } from '../../../domain/entities/refresh-token.entity';
import type { RefreshTokenRepository } from '../../../domain/repositories/refresh-token.repository';
import { RefreshTokenOrmEntity } from '../entities/refresh-token.orm-entity';
import { RefreshTokenMapper } from '../mappers/refresh-token.mapper';

@Injectable()
export class TypeOrmRefreshTokenRepository
  extends BaseTransactionalRepository<RefreshTokenOrmEntity>
  implements RefreshTokenRepository
{
  constructor(
    @InjectRepository(RefreshTokenOrmEntity)
    repository: Repository<RefreshTokenOrmEntity>,
  ) {
    super(repository);
  }

  async create(entity: RefreshTokenEntity): Promise<RefreshTokenEntity> {
    const orm = RefreshTokenMapper.toOrm(entity);
    const saved = await this.repository.save(orm);

    return RefreshTokenMapper.toDomain(saved);
  }

  async findByUuid(uuid: string): Promise<RefreshTokenEntity | null> {
    const row = await this.repository.findOne({ where: { uuid } });

    return row ? RefreshTokenMapper.toDomain(row) : null;
  }

  async revokeIfActive(uuid: string, replacedByUuid: string): Promise<boolean> {
    const result = await this.repository.update(
      { uuid, revokedAt: IsNull() },
      { revokedAt: new Date(), replacedByUuid },
    );

    return result.affected === 1;
  }

  async revokeAllForUser(userId: number): Promise<void> {
    await this.repository.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  hasActiveSession(
    userId: number,
    sessionId: string,
    now: Date,
  ): Promise<boolean> {
    return this.repository.existsBy({
      userId,
      sessionId,
      revokedAt: IsNull(),
      expiresAt: MoreThan(now),
    });
  }

  async deleteExpiredBefore(now: Date): Promise<number> {
    const result = await this.repository.delete({ expiresAt: LessThan(now) });

    return result.affected ?? 0;
  }

  async deleteRevokedBefore(threshold: Date): Promise<number> {
    const result = await this.repository.delete({
      revokedAt: LessThan(threshold),
    });

    return result.affected ?? 0;
  }
}
