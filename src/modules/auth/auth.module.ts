import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtTokenService } from './infra/services/jwt-token.service';
import { UserModule } from '../user/user.module';
import { AuthController } from './presentation/controllers/auth.controller';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { ITokenService } from './domain/services/token.service';
import { IUserRepository } from '../user/domain/repositories/user.repository.interface';
import { JwtStrategy } from './infra/strategies/jwt.strategy';
import { ProfileUseCase } from './application/use-cases/profile.use-case';
import { IRoleRepository } from '../access-control/domain/repositories/role.repository.interface';
import { AccessControlModule } from '../access-control/access-control.module';

@Module({
  imports: [JwtModule.register({}), UserModule, AccessControlModule],
  controllers: [AuthController],
  providers: [
    {
      provide: 'ITokenService',
      useClass: JwtTokenService,
    },
    {
      provide: LoginUseCase,
      useFactory: (tokenService: ITokenService, userRepo: IUserRepository) =>
        new LoginUseCase(tokenService, userRepo),
      inject: ['ITokenService', 'IUserRepository'],
    },
    {
      provide: ProfileUseCase,
      useFactory: (userRepo: IUserRepository, roleRepo: IRoleRepository) =>
        new ProfileUseCase(userRepo, roleRepo),
      inject: ['IUserRepository', 'IRoleRepository'],
    },
    JwtStrategy,
  ],
  exports: ['ITokenService'],
})
export class AuthModule {}
