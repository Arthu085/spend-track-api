import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { EmailType } from '@shared/domain/enums/email-type.enum';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import {
  EMAIL_JOB_HANDLER_REGISTRY,
  type EmailJob,
  type EmailJobHandler,
  type EmailJobHandlerRegistry,
} from '@shared/application/ports';
import {
  USER_CHANGE_REQUEST_REPOSITORY,
  type UserChangeRequestRepository,
} from '../../domain/repositories/user-change-request.repository';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../domain/repositories/user.repository';
import { USER_NOTIFIER, type UserNotifier } from '../ports/user-notifier.port';

@Injectable()
export class DeliverUserChangeRequestEmailUseCase
  implements EmailJobHandler, OnModuleInit
{
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(USER_CHANGE_REQUEST_REPOSITORY)
    private readonly changeRequestRepository: UserChangeRequestRepository,
    @Inject(USER_NOTIFIER)
    private readonly userNotifier: UserNotifier,
    @Inject(EMAIL_JOB_HANDLER_REGISTRY)
    private readonly handlerRegistry: EmailJobHandlerRegistry,
  ) {}

  onModuleInit(): void {
    this.handlerRegistry.register(EmailType.USER_CHANGE_REQUEST, this);
  }

  async handle(job: EmailJob): Promise<void> {
    const user = await this.userRepository.findByEmail(job.recipient);

    if (!user || user.status !== RecordStatus.ACTIVE) {
      return;
    }

    const pending = await this.changeRequestRepository.findPendingForUser(
      user.id,
      new Date(),
    );

    if (pending.length === 0) {
      return;
    }

    await this.userNotifier.sendUserChangeRequest({
      email: user.email,
      name: user.name,
      locale: job.locale,
    });
  }
}
