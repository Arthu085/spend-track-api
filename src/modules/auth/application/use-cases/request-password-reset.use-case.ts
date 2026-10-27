import { Inject, Injectable } from '@nestjs/common';
import { EmailType } from '@shared/domain/enums/email-type.enum';
import {
  EMAIL_OUTBOX_PORT,
  type EmailOutboxPort,
} from '@shared/application/ports';

export interface RequestPasswordResetInput {
  email: string;
}

@Injectable()
export class RequestPasswordResetUseCase {
  constructor(
    @Inject(EMAIL_OUTBOX_PORT)
    private readonly emailOutbox: EmailOutboxPort,
  ) {}

  async execute(input: RequestPasswordResetInput): Promise<void> {
    await this.emailOutbox.schedule({
      emailType: EmailType.PASSWORD_RESET,
      recipient: input.email,
    });
  }
}
