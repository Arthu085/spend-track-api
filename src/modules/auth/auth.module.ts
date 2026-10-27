import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoreHashingModule } from '@core/hashing';
import { AbilitiesGuard } from '@modules/authorization/presentation';
import { AuthorizationModule } from '@modules/authorization/authorization.module';
import { EmailOutboxModule } from '@modules/email-outbox/email-outbox.module';
import { UsersModule } from '@modules/users/users.module';
import { CleanupPasswordResetTokensUseCase } from './application/use-cases/cleanup-password-reset-tokens.use-case';
import { CleanupRefreshTokensUseCase } from './application/use-cases/cleanup-refresh-tokens.use-case';
import { DeliverPasswordResetEmailUseCase } from './application/use-cases/deliver-password-reset-email.use-case';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { LogoutUseCase } from './application/use-cases/logout.use-case';
import { RefreshTokensUseCase } from './application/use-cases/refresh-tokens.use-case';
import { RequestPasswordResetUseCase } from './application/use-cases/request-password-reset.use-case';
import { ResetPasswordUseCase } from './application/use-cases/reset-password.use-case';
import { ValidateAccessTokenUserUseCase } from './application/use-cases/validate-access-token-user.use-case';
import { IssueAuthTokensService } from './application/services/issue-auth-tokens.service';
import { PasswordResetTokenEmailChangeRevoker } from './application/services/password-reset-token-email-change-revoker';
import { PasswordResetTokenPasswordChangeRevoker } from './application/services/password-reset-token-password-change-revoker';
import { RefreshTokenSessionRevoker } from './application/services/refresh-token-session-revoker';
import { TOKEN_SERVICE } from './application/ports/token-service.port';
import { PASSWORD_RESET_TOKEN_REPOSITORY } from './domain/repositories/password-reset-token.repository';
import { REFRESH_TOKEN_REPOSITORY } from './domain/repositories/refresh-token.repository';
import { NestJwtTokenService } from './infrastructure/jwt/nest-jwt-token.service';
import { PasswordResetTokenOrmEntity } from './infrastructure/persistence/entities/password-reset-token.orm-entity';
import { RefreshTokenOrmEntity } from './infrastructure/persistence/entities/refresh-token.orm-entity';
import { TypeOrmPasswordResetTokenRepository } from './infrastructure/persistence/repositories/typeorm-password-reset-token.repository';
import { TypeOrmRefreshTokenRepository } from './infrastructure/persistence/repositories/typeorm-refresh-token.repository';
import { AuthTokenCleanupScheduler } from './infrastructure/scheduling/auth-token-cleanup.scheduler';
import { AuthSessionsController } from './presentation/controllers/auth-sessions.controller';
import { PasswordRecoveryController } from './presentation/controllers/password-recovery.controller';
import { CsrfGuard } from './presentation/guards/csrf.guard';
import { CsrfSessionResolver } from './presentation/http/csrf-session.resolver';
import { JwtAuthGuard } from './presentation/guards/jwt-auth.guard';
import { JwtStrategy } from './presentation/strategies/jwt.strategy';

@Module({
  imports: [
    UsersModule,
    AuthorizationModule,
    EmailOutboxModule,
    CoreHashingModule,
    PassportModule.register({ defaultStrategy: 'jwt', session: false }),
    JwtModule.register({}),
    TypeOrmModule.forFeature([
      RefreshTokenOrmEntity,
      PasswordResetTokenOrmEntity,
    ]),
  ],
  controllers: [AuthSessionsController, PasswordRecoveryController],
  providers: [
    {
      provide: REFRESH_TOKEN_REPOSITORY,
      useClass: TypeOrmRefreshTokenRepository,
    },
    {
      provide: PASSWORD_RESET_TOKEN_REPOSITORY,
      useClass: TypeOrmPasswordResetTokenRepository,
    },
    { provide: TOKEN_SERVICE, useClass: NestJwtTokenService },
    IssueAuthTokensService,
    PasswordResetTokenEmailChangeRevoker,
    PasswordResetTokenPasswordChangeRevoker,
    RefreshTokenSessionRevoker,
    LoginUseCase,
    RefreshTokensUseCase,
    LogoutUseCase,
    ValidateAccessTokenUserUseCase,
    RequestPasswordResetUseCase,
    DeliverPasswordResetEmailUseCase,
    ResetPasswordUseCase,
    CleanupRefreshTokensUseCase,
    CleanupPasswordResetTokensUseCase,
    AuthTokenCleanupScheduler,
    JwtStrategy,
    CsrfSessionResolver,
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useExisting: AbilitiesGuard },
  ],
})
export class AuthModule {}
