import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnvConfigService } from '../config/env/env-config.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [EnvConfigService],
      useFactory: (config: EnvConfigService) => ({
        ...config.databaseConfig,
        autoLoadEntities: true,
        synchronize: false,
        logging: config.nodeEnv === 'development',
      }),
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
