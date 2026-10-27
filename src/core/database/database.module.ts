import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigService } from '@core/config';
import { TRANSACTION_MANAGER } from '@shared/application/ports';
import { TypeOrmTransactionManager } from '@shared/infrastructure/persistence';
import { buildTypeOrmOptions } from './typeorm-options';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        buildTypeOrmOptions(config.database),
    }),
  ],
  providers: [
    { provide: TRANSACTION_MANAGER, useClass: TypeOrmTransactionManager },
  ],
  exports: [TRANSACTION_MANAGER],
})
export class DatabaseModule {}
