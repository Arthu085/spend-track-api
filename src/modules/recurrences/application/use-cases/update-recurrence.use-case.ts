import { Injectable, Inject } from '@nestjs/common';
import type { AccountEntity } from '@modules/accounts';
import type { TransactionCategoryEntity } from '@modules/transaction-categories';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { financeToday } from '@shared/domain/calendar';
import { RecurrenceEntity } from '../../domain/entities/recurrence.entity';
import { RecurrenceUpdateScope } from '../../domain/enums/recurrence-update-scope.enum';
import {
  RECURRENCE_REPOSITORY,
  type RecurrenceRepository,
} from '../../domain/repositories/recurrence.repository';
import { RecurrenceOccurrences } from '../services/recurrence-occurrences';
import { RecurrenceReferences } from '../services/recurrence-references';

export interface UpdateRecurrenceInput {
  uuid: string;
  ownerId: number;
  scope: RecurrenceUpdateScope;
  from?: string;
  description?: string;
  amount?: number;
  categoryUuid?: string;
  accountUuid?: string;
  notes?: string | null;
}

@Injectable()
export class UpdateRecurrenceUseCase {
  constructor(
    @Inject(RECURRENCE_REPOSITORY)
    private readonly recurrenceRepository: RecurrenceRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
    private readonly references: RecurrenceReferences,
    private readonly occurrences: RecurrenceOccurrences,
  ) {}

  async execute(input: UpdateRecurrenceInput): Promise<RecurrenceEntity> {
    return this.transactionManager.runInTransaction(async () => {
      await this.references.lockOwnerFinances(input.ownerId);

      const recurrence = await this.references.lockRecurrence(
        input.uuid,
        input.ownerId,
      );

      const today = financeToday();

      recurrence.assertChangeable(today);

      const details = {
        description: input.description ?? recurrence.description,
        amount: input.amount ?? recurrence.amount,
        category: await this.changedCategory(
          input.categoryUuid,
          recurrence.category,
          input.ownerId,
        ),
        account: await this.changedAccount(
          input.accountUuid,
          recurrence.account,
          input.ownerId,
        ),
        notes: input.notes === undefined ? recurrence.notes : input.notes,
      };

      const updated = await this.recurrenceRepository.update(
        recurrence.withDetails(details),
      );

      await this.occurrences.updatePlanned(
        updated,
        input.scope === RecurrenceUpdateScope.FUTURE
          ? (input.from ?? today)
          : undefined,
        details,
      );

      return updated;
    });
  }

  private async changedAccount(
    uuid: string | undefined,
    current: AccountEntity | null,
    ownerId: number,
  ): Promise<AccountEntity | null> {
    if (uuid === undefined || uuid === current?.uuid) {
      return current;
    }

    return this.references.activeAccount(uuid, ownerId);
  }

  private async changedCategory(
    uuid: string | undefined,
    current: TransactionCategoryEntity,
    ownerId: number,
  ): Promise<TransactionCategoryEntity> {
    if (uuid === undefined || uuid === current.uuid) {
      return current;
    }

    return this.references.activeCategory(uuid, ownerId);
  }
}
