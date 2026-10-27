import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import {
  BaseTransactionalRepository,
  deleteBatchBefore,
} from '@shared/infrastructure/persistence';
import { PasswordResetTokenEntity } from '../../../domain/entities/password-reset-token.entity';
import type { PasswordResetTokenRepository } from '../../../domain/repositories/password-reset-token.repository';
import { PasswordResetTokenOrmEntity } from '../entities/password-reset-token.orm-entity';
import { PasswordResetTokenMapper } from '../mappers/password-reset-token.mapper';

@Injectable()
export class TypeOrmPasswordResetTokenRepository
  extends BaseTransactionalRepository<PasswordResetTokenOrmEntity>
  implements PasswordResetTokenRepository
{
  constructor(
    @InjectRepository(PasswordResetTokenOrmEntity)
    repository: Repository<PasswordResetTokenOrmEntity>,
  ) {
    super(repository);
  }

  async create(
    entity: PasswordResetTokenEntity,
  ): Promise<PasswordResetTokenEntity> {
    const orm = PasswordResetTokenMapper.toOrm(entity);
    const saved = await this.repository.save(orm);

    return PasswordResetTokenMapper.toDomain(saved);
  }

  async findByUuid(uuid: string): Promise<PasswordResetTokenEntity | null> {
    const row = await this.repository.findOne({ where: { uuid } });

    return row ? PasswordResetTokenMapper.toDomain(row) : null;
  }

  async consumeIfUnconsumed(uuid: string): Promise<boolean> {
    const result = await this.repository.update(
      { uuid, consumedAt: IsNull() },
      { consumedAt: new Date() },
    );

    return result.affected === 1;
  }

  async consumeAllForUser(userId: number): Promise<void> {
    await this.repository.update(
      { userId, consumedAt: IsNull() },
      { consumedAt: new Date() },
    );
  }

  deleteExpiredBefore(cutoff: Date, limit: number): Promise<number> {
    return deleteBatchBefore(this.repository, 'expires_at', cutoff, limit);
  }
}
