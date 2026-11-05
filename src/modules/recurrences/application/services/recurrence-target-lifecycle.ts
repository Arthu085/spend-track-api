import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  AccountDeletionGuards,
  AccountHasRecurrencesError,
  type AccountDeletionGuard,
} from '@modules/accounts';
import {
  InvestmentLifecycle,
  InvestmentHasRecurrencesError,
  type InvestmentLifecycleParticipant,
} from '@modules/investments';
import { financeToday } from '@shared/domain/calendar';
import { PendingOperationsDecision } from '@shared/domain/pending-operations';
import { RecurrenceState } from '../../domain/enums/recurrence-state.enum';
import {
  RECURRENCE_REPOSITORY,
  type RecurrenceRepository,
} from '../../domain/repositories/recurrence.repository';

@Injectable()
export class RecurrenceTargetLifecycle implements OnModuleInit {
  constructor(
    @Inject(RECURRENCE_REPOSITORY)
    private readonly recurrenceRepository: RecurrenceRepository,
    private readonly accountDeletionGuards: AccountDeletionGuards,
    private readonly investmentLifecycle: InvestmentLifecycle,
  ) {}

  onModuleInit(): void {
    const accountGuard: AccountDeletionGuard = {
      assertCanDelete: async (ownerId, accountId) => {
        if (
          (
            await this.recurrenceRepository.findOpenByTarget(
              ownerId,
              { accountId },
              financeToday(),
            )
          ).length > 0
        ) {
          throw new AccountHasRecurrencesError();
        }
      },
    };

    const investmentParticipant: InvestmentLifecycleParticipant = {
      assertCanDelete: async (ownerId, investmentId) => {
        if (
          (
            await this.recurrenceRepository.findOpenByTarget(
              ownerId,
              { investmentId },
              financeToday(),
            )
          ).length > 0
        ) {
          throw new InvestmentHasRecurrencesError();
        }
      },
      archive: (ownerId, investmentId, decision) =>
        this.archive(ownerId, investmentId, decision),
    };

    this.accountDeletionGuards.register(accountGuard);
    this.investmentLifecycle.register(investmentParticipant);
  }

  private async archive(
    ownerId: number,
    investmentId: number,
    decision: PendingOperationsDecision | undefined,
  ): Promise<void> {
    const today = financeToday();

    for (const recurrence of await this.recurrenceRepository.findOpenByTarget(
      ownerId,
      { investmentId },
      today,
    )) {
      if (decision === PendingOperationsDecision.CANCEL) {
        await this.recurrenceRepository.update(
          recurrence.endBefore(null, today),
        );
      } else if (recurrence.state === RecurrenceState.ACTIVE) {
        await this.recurrenceRepository.update(recurrence.pause(today));
      }
    }
  }
}
