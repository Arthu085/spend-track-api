import { Module } from '@nestjs/common';
import { UserRepository } from './infra/repositories/user.repository';

@Module({
  providers: [
    {
      provide: 'IUserRepository',
      useClass: UserRepository,
    },
  ],
  exports: ['IUserRepository'],
})
export class UserModule {}
