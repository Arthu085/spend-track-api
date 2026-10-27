import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { EmailType } from '@shared/domain/enums/email-type.enum';
import {
  EMAIL_JOB_HANDLER_REGISTRY,
  type EmailJob,
  type EmailJobHandler,
  type EmailJobHandlerRegistry,
} from '@shared/application/ports';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../domain/repositories/user.repository';
import { IssueEmailConfirmationTokenService } from '../services/issue-email-confirmation-token.service';

@Injectable()
export class DeliverEmailConfirmationUseCase
  implements EmailJobHandler, OnModuleInit
{
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    private readonly issueEmailConfirmationToken: IssueEmailConfirmationTokenService,
    @Inject(EMAIL_JOB_HANDLER_REGISTRY)
    private readonly handlerRegistry: EmailJobHandlerRegistry,
  ) {}

  onModuleInit(): void {
    this.handlerRegistry.register(EmailType.EMAIL_CONFIRMATION, this);
  }

  async handle(job: EmailJob): Promise<void> {
    const user = await this.userRepository.findByEmail(job.recipient);

    if (!user || user.emailConfirmedAt !== null) {
      return;
    }

    await this.issueEmailConfirmationToken.issueFor(user.id, job);
  }
}
