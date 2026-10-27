import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigService } from '@core/config';
import { CoreHashingModule } from '@core/hashing';
import { CoreMailModule } from '@core/mail';
import { AuthorizationModule } from '@modules/authorization/authorization.module';
import { EmailOutboxModule } from '@modules/email-outbox/email-outbox.module';
import { ApproveUserChangeRequestUseCase } from './application/use-cases/approve-user-change-request.use-case';
import { ChangeOwnPasswordUseCase } from './application/use-cases/change-own-password.use-case';
import { CleanupEmailConfirmationTokensUseCase } from './application/use-cases/cleanup-email-confirmation-tokens.use-case';
import { ConfirmEmailUseCase } from './application/use-cases/confirm-email.use-case';
import { CreateUserUseCase } from './application/use-cases/create-user.use-case';
import { DeleteUserUseCase } from './application/use-cases/delete-user.use-case';
import { DeliverEmailChangeNoticeUseCase } from './application/use-cases/deliver-email-change-notice.use-case';
import { DeliverEmailConfirmationUseCase } from './application/use-cases/deliver-email-confirmation.use-case';
import { DeliverUserChangeRequestEmailUseCase } from './application/use-cases/deliver-user-change-request-email.use-case';
import { GetUserUseCase } from './application/use-cases/get-user.use-case';
import { ListMyUserChangeRequestsUseCase } from './application/use-cases/list-my-user-change-requests.use-case';
import { ListOwnAbilitiesUseCase } from './application/use-cases/list-own-abilities.use-case';
import { ListUsersUseCase } from './application/use-cases/list-users.use-case';
import { RejectUserChangeRequestUseCase } from './application/use-cases/reject-user-change-request.use-case';
import { RequestUserChangeUseCase } from './application/use-cases/request-user-change.use-case';
import { ResendEmailConfirmationUseCase } from './application/use-cases/resend-email-confirmation.use-case';
import { UpdateOwnProfileUseCase } from './application/use-cases/update-own-profile.use-case';
import { UpdateUserStatusUseCase } from './application/use-cases/update-user-status.use-case';
import { UpdateUserUseCase } from './application/use-cases/update-user.use-case';
import { EmailChangeTokenRevokers } from './application/services/email-change-token-revokers';
import { IssueEmailConfirmationTokenService } from './application/services/issue-email-confirmation-token.service';
import { PasswordChangeTokenRevokers } from './application/services/password-change-token-revokers';
import { UserProfileChangeService } from './application/services/user-profile-change.service';
import { UserSessionRevokers } from './application/services/user-session-revokers';
import { EMAIL_CHANGE_TOKEN_REVOKERS } from './application/ports/email-change-token-revoker.port';
import { PASSWORD_CHANGE_TOKEN_REVOKERS } from './application/ports/password-change-token-revoker.port';
import { PASSWORD_HASHER } from './application/ports/password-hasher.port';
import { USER_NOTIFIER } from './application/ports/user-notifier.port';
import { USER_SESSION_REVOKERS } from './application/ports/user-session-revoker.port';
import { EMAIL_CONFIRMATION_TOKEN_REPOSITORY } from './domain/repositories/email-confirmation-token.repository';
import { USER_CHANGE_REQUEST_REPOSITORY } from './domain/repositories/user-change-request.repository';
import { USER_REPOSITORY } from './domain/repositories/user.repository';
import { Argon2PasswordHasher } from './infrastructure/hashing/argon2-password-hasher';
import { EmailConfirmationTokenOrmEntity } from './infrastructure/persistence/entities/email-confirmation-token.orm-entity';
import { UserChangeRequestOrmEntity } from './infrastructure/persistence/entities/user-change-request.orm-entity';
import { UserOrmEntity } from './infrastructure/persistence/entities/user.orm-entity';
import { TypeOrmEmailConfirmationTokenRepository } from './infrastructure/persistence/repositories/typeorm-email-confirmation-token.repository';
import { TypeOrmUserChangeRequestRepository } from './infrastructure/persistence/repositories/typeorm-user-change-request.repository';
import { TypeOrmUserRepository } from './infrastructure/persistence/repositories/typeorm-user.repository';
import { LoggingUserNotifier } from './infrastructure/notifications/logging-user-notifier';
import { SmtpUserNotifier } from './infrastructure/notifications/smtp-user-notifier';
import { selectUserNotifier } from './infrastructure/notifications/user-notifier.provider';
import { EmailConfirmationTokenCleanupScheduler } from './infrastructure/scheduling/email-confirmation-token-cleanup.scheduler';
import { UserChangeRequestsController } from './presentation/controllers/user-change-requests.controller';
import { UserEmailConfirmationController } from './presentation/controllers/user-email-confirmation.controller';
import { UsersManagementController } from './presentation/controllers/users-management.controller';
import { UsersProfileController } from './presentation/controllers/users-profile.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserOrmEntity,
      EmailConfirmationTokenOrmEntity,
      UserChangeRequestOrmEntity,
    ]),
    AuthorizationModule,
    EmailOutboxModule,
    CoreMailModule,
    CoreHashingModule,
  ],
  controllers: [
    UserEmailConfirmationController,
    UsersProfileController,
    UserChangeRequestsController,
    UsersManagementController,
  ],
  providers: [
    { provide: USER_REPOSITORY, useClass: TypeOrmUserRepository },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    LoggingUserNotifier,
    SmtpUserNotifier,
    {
      provide: USER_NOTIFIER,
      inject: [AppConfigService, LoggingUserNotifier, SmtpUserNotifier],
      useFactory: selectUserNotifier,
    },
    {
      provide: EMAIL_CONFIRMATION_TOKEN_REPOSITORY,
      useClass: TypeOrmEmailConfirmationTokenRepository,
    },
    {
      provide: USER_CHANGE_REQUEST_REPOSITORY,
      useClass: TypeOrmUserChangeRequestRepository,
    },
    {
      provide: EMAIL_CHANGE_TOKEN_REVOKERS,
      useClass: EmailChangeTokenRevokers,
    },
    {
      provide: PASSWORD_CHANGE_TOKEN_REVOKERS,
      useClass: PasswordChangeTokenRevokers,
    },
    {
      provide: USER_SESSION_REVOKERS,
      useClass: UserSessionRevokers,
    },
    IssueEmailConfirmationTokenService,
    UserProfileChangeService,
    CreateUserUseCase,
    ListUsersUseCase,
    GetUserUseCase,
    ListOwnAbilitiesUseCase,
    UpdateUserUseCase,
    UpdateOwnProfileUseCase,
    ChangeOwnPasswordUseCase,
    UpdateUserStatusUseCase,
    DeleteUserUseCase,
    ConfirmEmailUseCase,
    ResendEmailConfirmationUseCase,
    DeliverEmailConfirmationUseCase,
    CleanupEmailConfirmationTokensUseCase,
    ListMyUserChangeRequestsUseCase,
    RequestUserChangeUseCase,
    ApproveUserChangeRequestUseCase,
    RejectUserChangeRequestUseCase,
    DeliverUserChangeRequestEmailUseCase,
    DeliverEmailChangeNoticeUseCase,
    EmailConfirmationTokenCleanupScheduler,
  ],
  exports: [
    USER_REPOSITORY,
    PASSWORD_HASHER,
    USER_NOTIFIER,
    EMAIL_CHANGE_TOKEN_REVOKERS,
    PASSWORD_CHANGE_TOKEN_REVOKERS,
    USER_SESSION_REVOKERS,
  ],
})
export class UsersModule {}
