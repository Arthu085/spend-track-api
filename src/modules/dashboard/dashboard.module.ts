import { Module } from '@nestjs/common';
import { AccountsModule } from '@modules/accounts/accounts.module';
import { PreferencesModule } from '@modules/preferences/preferences.module';
import { GetDashboardUseCase } from './application/use-cases/get-dashboard.use-case';
import { DashboardController } from './presentation/controllers/dashboard.controller';

@Module({
  imports: [AccountsModule, PreferencesModule],
  controllers: [DashboardController],
  providers: [GetDashboardUseCase],
})
export class DashboardModule {}
