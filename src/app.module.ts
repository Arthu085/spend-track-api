import { Module } from '@nestjs/common';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import { CoreHealthModule } from '@core/health';
import { CoreHttpModule } from '@core/http';
import { CoreI18nModule } from '@core/i18n';
import { CoreLoggingModule } from '@core/logging';
import { CoreSchedulingModule } from '@core/scheduling';
import { CoreThrottlerModule } from '@core/throttler';
import { AccountsModule } from '@modules/accounts/accounts.module';
import { AuditModule } from '@modules/audit/audit.module';
import { AuthModule } from '@modules/auth/auth.module';
import { AuthorizationModule } from '@modules/authorization/authorization.module';
import { TransactionCategoriesModule } from '@modules/transaction-categories/transaction-categories.module';
import { DashboardModule } from '@modules/dashboard/dashboard.module';
import { PreferencesModule } from '@modules/preferences/preferences.module';
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
    PreferencesModule,
    AccountsModule,
    TransactionCategoriesModule,
    DashboardModule,
    CoreHealthModule,
    CoreI18nModule,
    CoreHttpModule,
  ],
})
export class AppModule {}
