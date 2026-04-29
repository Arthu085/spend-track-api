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

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
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
    {
      provide: 'ITokenService',
      useClass: JwtTokenService,
    },
    LoginUseCase,
    ProfileUseCase,
  ],
  exports: ['ITokenService'],
})
export class AuthModule {}
