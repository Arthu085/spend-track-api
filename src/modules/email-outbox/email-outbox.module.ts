import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  EMAIL_JOB_HANDLER_REGISTRY,
  EMAIL_OUTBOX_PORT,
} from '@shared/application/ports';
import { EmailQuotaModule } from '@modules/email-quota/email-quota.module';
import { REQUEST_LOCALE } from './application/ports/request-locale.port';
import { EmailJobHandlers } from './application/services/email-job-handlers.service';
import { CleanupEmailOutboxUseCase } from './application/use-cases/cleanup-email-outbox.use-case';
import { DispatchEmailOutboxUseCase } from './application/use-cases/dispatch-email-outbox.use-case';
import { ScheduleEmailUseCase } from './application/use-cases/schedule-email.use-case';
import { EMAIL_OUTBOX_REPOSITORY } from './domain/repositories/email-outbox.repository';
import { I18nRequestLocale } from './infrastructure/i18n/i18n-request-locale';
import { EmailOutboxJobOrmEntity } from './infrastructure/persistence/entities/email-outbox-job.orm-entity';
import { TypeOrmEmailOutboxRepository } from './infrastructure/persistence/repositories/typeorm-email-outbox.repository';
import { EmailOutboxCleanupScheduler } from './infrastructure/scheduling/email-outbox-cleanup.scheduler';
import { EmailOutboxWorker } from './infrastructure/scheduling/email-outbox.worker';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmailOutboxJobOrmEntity]),
    EmailQuotaModule,
  ],
  providers: [
    {
      provide: EMAIL_OUTBOX_REPOSITORY,
      useClass: TypeOrmEmailOutboxRepository,
    },
    { provide: REQUEST_LOCALE, useClass: I18nRequestLocale },
    EmailJobHandlers,
    { provide: EMAIL_JOB_HANDLER_REGISTRY, useExisting: EmailJobHandlers },
    { provide: EMAIL_OUTBOX_PORT, useClass: ScheduleEmailUseCase },
    DispatchEmailOutboxUseCase,
    CleanupEmailOutboxUseCase,
    EmailOutboxWorker,
    EmailOutboxCleanupScheduler,
  ],
  exports: [EMAIL_OUTBOX_PORT, EMAIL_JOB_HANDLER_REGISTRY],
})
export class EmailOutboxModule {}
