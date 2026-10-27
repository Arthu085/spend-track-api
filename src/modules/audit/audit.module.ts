import { Global, Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AUDIT_LOG_PORT } from '@shared/application/ports';
import { CleanupAuditLogsUseCase } from './application/use-cases/cleanup-audit-logs.use-case';
import { RecordAuditLogUseCase } from './application/use-cases/record-audit-log.use-case';
import { AUDIT_LOG_REPOSITORY } from './domain/repositories/audit-log.repository';
import { AuditLogOrmEntity } from './infrastructure/persistence/entities/audit-log.orm-entity';
import { TypeOrmAuditLogRepository } from './infrastructure/persistence/repositories/typeorm-audit-log.repository';
import { AuditLogCleanupScheduler } from './infrastructure/scheduling/audit-log-cleanup.scheduler';
import { AuditContextGuard } from './presentation/guards/audit-context.guard';
import { AuditInterceptor } from './presentation/interceptors/audit.interceptor';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLogOrmEntity])],
  providers: [
    { provide: AUDIT_LOG_REPOSITORY, useClass: TypeOrmAuditLogRepository },
    { provide: AUDIT_LOG_PORT, useClass: RecordAuditLogUseCase },
    CleanupAuditLogsUseCase,
    AuditLogCleanupScheduler,
    { provide: APP_GUARD, useClass: AuditContextGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [AUDIT_LOG_PORT],
})
export class AuditModule {}
