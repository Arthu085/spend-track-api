import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { EnvOptions } from 'src/core/config/env/types/env.types';
import { getTypeOrmConfig } from './typeorm.config';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        return getTypeOrmConfig(configService.get<EnvOptions>('env')!);
      },
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
