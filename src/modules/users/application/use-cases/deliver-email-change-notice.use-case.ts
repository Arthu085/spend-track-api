import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { EmailType } from '@shared/domain/enums/email-type.enum';
import {
  EMAIL_JOB_HANDLER_REGISTRY,
  type EmailJob,
  type EmailJobHandler,
  type EmailJobHandlerRegistry,
} from '@shared/application/ports';
import { USER_NOTIFIER, type UserNotifier } from '../ports/user-notifier.port';

@Injectable()
export class DeliverEmailChangeNoticeUseCase
  implements EmailJobHandler, OnModuleInit
{
  constructor(
    @Inject(USER_NOTIFIER)
    private readonly userNotifier: UserNotifier,
    @Inject(EMAIL_JOB_HANDLER_REGISTRY)
    private readonly handlerRegistry: EmailJobHandlerRegistry,
  ) {}

  onModuleInit(): void {
    this.handlerRegistry.register(EmailType.EMAIL_CHANGE_NOTICE, this);
  }

  async handle(job: EmailJob): Promise<void> {
    await this.userNotifier.sendEmailChangeNotice({
      email: job.recipient,
      locale: job.locale,
    });
  }
}
