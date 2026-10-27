import { Body, Controller, HttpStatus } from '@nestjs/common';
import { endpoint } from '@shared/presentation/builders';
import { PublicAuthFlowThrottle } from '@shared/presentation/throttling';
import { ConfirmEmailUseCase } from '../../application/use-cases/confirm-email.use-case';
import { ResendEmailConfirmationUseCase } from '../../application/use-cases/resend-email-confirmation.use-case';
import { ConfirmEmailDto } from '../dto/input/confirm-email.dto';
import { ResendEmailConfirmationDto } from '../dto/input/resend-email-confirmation.dto';

@Controller('users')
export class UserEmailConfirmationController {
  constructor(
    private readonly confirmEmailUseCase: ConfirmEmailUseCase,
    private readonly resendEmailConfirmationUseCase: ResendEmailConfirmationUseCase,
  ) {}

  @(endpoint()
    .post('confirm-email')
    .public()
    .httpCode(HttpStatus.OK)
    .audit('User.confirm_email')
    .successMessage('users.success.email_confirmed')
    .use(PublicAuthFlowThrottle())
    .tags('users')
    .summary('Confirm a user email using the token from the confirmation link')
    .errorResponse(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'The confirmation token is invalid, expired, or already used.',
    )
    .body(ConfirmEmailDto)
    .build())
  async confirmEmail(@Body() dto: ConfirmEmailDto): Promise<null> {
    await this.confirmEmailUseCase.execute({ token: dto.token });

    return null;
  }

  @(endpoint()
    .post('resend-confirmation')
    .public()
    .httpCode(HttpStatus.OK)
    .audit('User.resend_confirmation')
    .successMessage('users.success.confirmation_sent')
    .use(PublicAuthFlowThrottle())
    .tags('users')
    .summary('Resend the email-confirmation link for an unconfirmed account')
    .body(ResendEmailConfirmationDto)
    .build())
  async resendConfirmation(
    @Body() dto: ResendEmailConfirmationDto,
  ): Promise<null> {
    await this.resendEmailConfirmationUseCase.execute({ email: dto.email });

    return null;
  }
}
