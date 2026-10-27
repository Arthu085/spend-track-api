import { Module } from '@nestjs/common';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import { CoreHealthModule } from '@core/health';
import { CoreHttpModule } from '@core/http';
import { CoreI18nModule } from '@core/i18n';
import { CoreLoggingModule } from '@core/logging';
import { CoreSchedulingModule } from '@core/scheduling';
import { CoreThrottlerModule } from '@core/throttler';
import { AuditModule } from '@modules/audit/audit.module';
import { AuthModule } from '@modules/auth/auth.module';
import { AuthorizationModule } from '@modules/authorization/authorization.module';
import { UsersModule } from '@modules/users/users.module';

@Module({
  imports: [
    CoreConfigModule,
    CoreLoggingModule,
    DatabaseModule,
    CoreSchedulingModule,
    AuditModule,
    CoreThrottlerModule,
    AuthModule,
    AuthorizationModule,
    UsersModule,
    CoreHealthModule,
    CoreI18nModule,
    CoreHttpModule,
  ],
})
export class AppModule {}
