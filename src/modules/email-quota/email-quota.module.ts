import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EMAIL_QUOTA_PORT } from '@shared/application/ports';
import { CleanupEmailSendLogsUseCase } from './application/use-cases/cleanup-email-send-logs.use-case';
import { ConsumeEmailQuotaUseCase } from './application/use-cases/consume-email-quota.use-case';
import { EMAIL_SEND_LOG_REPOSITORY } from './domain/repositories/email-send-log.repository';
import { EmailSendLogOrmEntity } from './infrastructure/persistence/entities/email-send-log.orm-entity';
import { TypeOrmEmailSendLogRepository } from './infrastructure/persistence/repositories/typeorm-email-send-log.repository';
import { EmailSendLogCleanupScheduler } from './infrastructure/scheduling/email-send-log-cleanup.scheduler';

@Module({
  imports: [TypeOrmModule.forFeature([EmailSendLogOrmEntity])],
  providers: [
    {
      provide: EMAIL_SEND_LOG_REPOSITORY,
      useClass: TypeOrmEmailSendLogRepository,
    },
    { provide: EMAIL_QUOTA_PORT, useClass: ConsumeEmailQuotaUseCase },
    CleanupEmailSendLogsUseCase,
    EmailSendLogCleanupScheduler,
  ],
  exports: [EMAIL_QUOTA_PORT],
})
export class EmailQuotaModule {}
