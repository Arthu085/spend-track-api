import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRepository } from './infra/repositories/user.repository';

@Module({
  providers: [
    {
      provide: 'IUserRepository',
      useFactory: (dataSource: DataSource) => new UserRepository(dataSource),
      inject: [DataSource],
    },
  ],
  exports: ['IUserRepository'],
})
export class UserModule {}
