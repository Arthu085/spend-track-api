import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { DAY_IN_MS } from '@shared/application/time';
import {
  BaseTransactionalRepository,
  deleteBatchBefore,
} from '@shared/infrastructure/persistence';
import {
  ConsumeDailySlotInput,
  EmailSendLogRepository,
} from '../../../domain/repositories/email-send-log.repository';
import { EmailSendLogOrmEntity } from '../entities/email-send-log.orm-entity';

const LOCK_TIMEOUT = '3000ms';

@Injectable()
export class TypeOrmEmailSendLogRepository
  extends BaseTransactionalRepository<EmailSendLogOrmEntity>
  implements EmailSendLogRepository
{
  constructor(
    @InjectRepository(EmailSendLogOrmEntity)
    repository: Repository<EmailSendLogOrmEntity>,
  ) {
    super(repository);
  }

  async consumeDailySlot(input: ConsumeDailySlotInput): Promise<number | null> {
    const lockKey = `email-quota:${input.emailType}:${input.recipient}:${input.day}`;

    return this.repository.manager.transaction(async (manager) => {
      const [{ lock_timeout: previousLockTimeout }] =
        await manager.query<Array<{ lock_timeout: string }>>(
          `SHOW lock_timeout`,
        );

      await manager.query(`SELECT set_config('lock_timeout', $1, true)`, [
        LOCK_TIMEOUT,
      ]);

      await manager.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
        [lockKey],
      );

      await manager.query(`SELECT set_config('lock_timeout', $1, true)`, [
        previousLockTimeout,
      ]);

      const dayStart = new Date(`${input.day}T00:00:00.000Z`);
      const dayEnd = new Date(dayStart.getTime() + DAY_IN_MS);

      const used = await manager.countBy(EmailSendLogOrmEntity, {
        emailType: input.emailType,
        recipient: input.recipient,
        createdAt: Between(dayStart, dayEnd),
      });

      if (used >= input.limit) {
        return null;
      }

      await manager.insert(EmailSendLogOrmEntity, {
        emailType: input.emailType,
        recipient: input.recipient,
      });

      return used + 1;
    });
  }

  deleteCreatedBefore(cutoff: Date, limit: number): Promise<number> {
    return deleteBatchBefore(this.repository, 'created_at', cutoff, limit);
  }
}
