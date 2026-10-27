import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import {
  BaseTransactionalRepository,
  deleteBatchBefore,
} from '@shared/infrastructure/persistence';
import { EmailConfirmationTokenEntity } from '../../../domain/entities/email-confirmation-token.entity';
import type { EmailConfirmationTokenRepository } from '../../../domain/repositories/email-confirmation-token.repository';
import { EmailConfirmationTokenOrmEntity } from '../entities/email-confirmation-token.orm-entity';
import { EmailConfirmationTokenMapper } from '../mappers/email-confirmation-token.mapper';

@Injectable()
export class TypeOrmEmailConfirmationTokenRepository
  extends BaseTransactionalRepository<EmailConfirmationTokenOrmEntity>
  implements EmailConfirmationTokenRepository
{
  constructor(
    @InjectRepository(EmailConfirmationTokenOrmEntity)
    repository: Repository<EmailConfirmationTokenOrmEntity>,
  ) {
    super(repository);
  }

  async create(
    entity: EmailConfirmationTokenEntity,
  ): Promise<EmailConfirmationTokenEntity> {
    const orm = EmailConfirmationTokenMapper.toOrm(entity);
    const saved = await this.repository.save(orm);

    return EmailConfirmationTokenMapper.toDomain(saved);
  }

  async findByUuid(uuid: string): Promise<EmailConfirmationTokenEntity | null> {
    const row = await this.repository.findOne({ where: { uuid } });

    return row ? EmailConfirmationTokenMapper.toDomain(row) : null;
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
