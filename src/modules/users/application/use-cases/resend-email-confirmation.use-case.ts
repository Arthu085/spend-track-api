import { Inject, Injectable } from '@nestjs/common';
import { EmailType } from '@shared/domain/enums/email-type.enum';
import {
  EMAIL_OUTBOX_PORT,
  type EmailOutboxPort,
} from '@shared/application/ports';

export interface ResendEmailConfirmationInput {
  email: string;
}

@Injectable()
export class ResendEmailConfirmationUseCase {
  constructor(
    @Inject(EMAIL_OUTBOX_PORT)
    private readonly emailOutbox: EmailOutboxPort,
  ) {}

  async execute(input: ResendEmailConfirmationInput): Promise<void> {
    await this.emailOutbox.schedule({
      emailType: EmailType.EMAIL_CONFIRMATION,
      recipient: input.email,
    });
  }
}
