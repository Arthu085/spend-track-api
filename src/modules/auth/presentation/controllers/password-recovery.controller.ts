import { Body, Controller, HttpStatus } from '@nestjs/common';
import { endpoint } from '@shared/presentation/builders';
import { PublicAuthFlowThrottle } from '@shared/presentation/throttling';
import { RequestPasswordResetUseCase } from '../../application/use-cases/request-password-reset.use-case';
import { ResetPasswordUseCase } from '../../application/use-cases/reset-password.use-case';
import { ForgotPasswordDto } from '../dto/input/forgot-password.dto';
import { ResetPasswordDto } from '../dto/input/reset-password.dto';

@Controller('auth')
export class PasswordRecoveryController {
  constructor(
    private readonly requestPasswordResetUseCase: RequestPasswordResetUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
  ) {}

  @(endpoint()
    .post('forgot-password')
    .public()
    .httpCode(HttpStatus.OK)
    .audit('Auth.forgot_password')
    .successMessage('auth.success.password_reset_requested')
    .use(PublicAuthFlowThrottle())
    .tags('auth')
    .summary('Request a password-reset link for an account')
    .body(ForgotPasswordDto)
    .build())
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<null> {
    await this.requestPasswordResetUseCase.execute({ email: dto.email });

    return null;
  }

  @(endpoint()
    .post('reset-password')
    .public()
    .httpCode(HttpStatus.OK)
    .audit('Auth.reset_password')
    .successMessage('auth.success.password_reset')
    .use(PublicAuthFlowThrottle())
    .tags('auth')
    .summary('Reset a password using the token from the reset-password link')
    .errorResponse(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'The reset token is invalid, expired, or already used.',
    )
    .body(ResetPasswordDto)
    .build())
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<null> {
    await this.resetPasswordUseCase.execute({
      token: dto.token,
      password: dto.password,
    });

    return null;
  }
}
