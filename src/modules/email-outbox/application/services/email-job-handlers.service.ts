import { Injectable } from '@nestjs/common';
import { EmailType } from '@shared/domain/enums/email-type.enum';
import type {
  EmailJobHandler,
  EmailJobHandlerRegistry,
} from '@shared/application/ports';

@Injectable()
export class EmailJobHandlers implements EmailJobHandlerRegistry {
  private readonly handlers = new Map<EmailType, EmailJobHandler>();

  register(emailType: EmailType, handler: EmailJobHandler): void {
    if (this.handlers.has(emailType)) {
      throw new Error(
        `An email job handler for ${emailType} is already registered`,
      );
    }

    this.handlers.set(emailType, handler);
  }

  resolve(emailType: EmailType): EmailJobHandler | undefined {
    return this.handlers.get(emailType);
  }
}
