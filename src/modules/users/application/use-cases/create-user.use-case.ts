import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ROLE_REPOSITORY,
  assertRolesResolved,
  type RoleRepository,
} from '@modules/authorization';
import { EmailType } from '@shared/domain/enums/email-type.enum';
import { normalizeEmail } from '@shared/application/filters';
import {
  EMAIL_OUTBOX_PORT,
  EmailSchedulingUnavailableError,
  TRANSACTION_MANAGER,
  type EmailOutboxPort,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { UserEntity } from '../../domain/entities/user.entity';
import { EmailAlreadyInUseError } from '../../domain/errors/email-already-in-use.error';
import { assertAdminGrantAllowed } from '../../domain/policies/admin-safety.policy';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../domain/repositories/user.repository';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../ports/password-hasher.port';

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  roleUuids: string[];
  actorId: number | null;
}

@Injectable()
export class CreateUserUseCase {
  private readonly logger = new Logger(CreateUserUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(ROLE_REPOSITORY)
    private readonly roleRepository: RoleRepository,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasher,
    @Inject(EMAIL_OUTBOX_PORT)
    private readonly emailOutbox: EmailOutboxPort,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
  ) {}

  async execute(input: CreateUserInput): Promise<UserEntity> {
    const email = normalizeEmail(input.email);

    const { created, confirmation } =
      await this.transactionManager.runInTransaction(async () => {
        await this.userRepository.lockAdminRoster();
        const existing = await this.userRepository.findByEmail(email);

        if (existing) {
          throw new EmailAlreadyInUseError();
        }

        const roles = await this.roleRepository.findByUuids(input.roleUuids);
        assertRolesResolved(input.roleUuids, roles);

        const actor =
          input.actorId === null
            ? null
            : await this.userRepository.findById(input.actorId);

        assertAdminGrantAllowed(
          actor,
          null,
          roles.map((role) => role.name),
        );
        const hashedPassword = await this.passwordHasher.hash(input.password);

        const user = UserEntity.create({
          uuid: randomUUID(),
          name: input.name,
          email,
          password: hashedPassword,
          roles,
          createdBy: input.actorId,
        });

        const created = await this.userRepository.create(user);

        const confirmation = await this.emailOutbox.schedule({
          emailType: EmailType.EMAIL_CONFIRMATION,
          recipient: created.email,
        });

        if (!confirmation.scheduled && confirmation.reason === 'UNAVAILABLE') {
          throw new EmailSchedulingUnavailableError();
        }

        return { created, confirmation };
      });

    if (!confirmation.scheduled) {
      this.logger.warn({
        msg: 'Email confirmation not scheduled',
        userId: created.uuid,
        reason: confirmation.reason,
      });
    }

    return created;
  }
}
