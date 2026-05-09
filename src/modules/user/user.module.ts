import { Module } from '@nestjs/common';
import { UserRepository } from './infra/repositories/user.repository';
import { UserController } from './presentation/controllers/user.controller';
import { CreateUserUseCase } from './application/use-cases/create-user.use-case';
import { AccessControlModule } from '../access-control/access-control.module';
import { UpdateUserUseCase } from './application/use-cases/update-user.use-case';
import { UserApplicationService } from './application/services/user-application.service';
import { FindAllUserUseCase } from './application/use-cases/find-all-user.use-case';
import { FindOneUserUseCase } from './application/use-cases/find-one-user.use-case';
import { DeleteUserUseCase } from './application/use-cases/delete-user.use-case';

@Module({
  imports: [AccessControlModule],
  controllers: [UserController],
  providers: [
    {
      provide: 'IUserRepository',
      useClass: UserRepository,
    },
    UserApplicationService,
    FindAllUserUseCase,
    FindOneUserUseCase,
    CreateUserUseCase,
    UpdateUserUseCase,
    DeleteUserUseCase,
  ],
  exports: ['IUserRepository'],
})
export class UserModule {}
