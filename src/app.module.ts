import { Module } from '@nestjs/common';
import { EnvConfigModule } from './infra/config/env/env-config.module';
import { DatabaseModule } from './infra/database/database.module';

@Module({
  imports: [EnvConfigModule, DatabaseModule],
})
export class AppModule {}
