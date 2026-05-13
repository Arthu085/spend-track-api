import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { jwtConfig } from '../../core/config/auth/jwt.config';
import { JwtTokenService } from './infra/services/jwt-token.service';
import { UserModule } from '../user/user.module';
import { AuthController } from './presentation/controllers/auth.controller';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { JwtStrategy } from './infra/strategies/jwt.strategy';
import { ProfileUseCase } from './application/use-cases/profile.use-case';
import { AccessControlModule } from '../access-control/access-control.module';
import { JwtRefreshStrategy } from './infra/strategies/jwt-refresh.strategy';
import { RefreshUseCase } from './application/use-cases/refresh.use-case';

@Module({
  imports: [
    PassportModule.register({}),
    JwtModule.register({
      secret: jwtConfig.access.secret,
      signOptions: { expiresIn: jwtConfig.access.expiresIn },
    }),
    UserModule,
    AccessControlModule,
  ],
  controllers: [AuthController],
  providers: [
    JwtStrategy,
    JwtRefreshStrategy,
    {
      provide: 'ITokenService',
      useClass: JwtTokenService,
    },
    LoginUseCase,
    ProfileUseCase,
    RefreshUseCase,
  ],
  exports: ['ITokenService'],
})
export class AuthModule {}
