import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryDeepPartialEntity, Repository } from 'typeorm';
import {
  BaseTransactionalRepository,
  deleteBatchBefore,
} from '@shared/infrastructure/persistence';
import { AuditLog } from '../../../domain/entities/audit-log.entity';
import { AuditLogRepository } from '../../../domain/repositories/audit-log.repository';
import { AuditLogOrmEntity } from '../entities/audit-log.orm-entity';
import { AuditLogMapper } from '../mappers/audit-log.mapper';

@Injectable()
export class TypeOrmAuditLogRepository
  extends BaseTransactionalRepository<AuditLogOrmEntity>
  implements AuditLogRepository
{
  constructor(
    @InjectRepository(AuditLogOrmEntity)
    repository: Repository<AuditLogOrmEntity>,
  ) {
    super(repository);
  }

  async save(log: AuditLog): Promise<void> {
    const orm = AuditLogMapper.toOrm(log);

    await this.repository.insert(
      orm as QueryDeepPartialEntity<AuditLogOrmEntity>,
    );
  }

  deleteCreatedBefore(cutoff: Date, limit: number): Promise<number> {
    return deleteBatchBefore(this.repository, 'created_at', cutoff, limit);
  }
}
