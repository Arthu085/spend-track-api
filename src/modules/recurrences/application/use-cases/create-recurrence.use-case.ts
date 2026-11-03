import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { financeToday } from '@shared/domain/calendar';
import { RecurrenceEntity } from '../../domain/entities/recurrence.entity';
import { RecurrenceFrequency } from '../../domain/enums/recurrence-frequency.enum';
import { RecurrenceType } from '../../domain/enums/recurrence-type.enum';
import {
  RECURRENCE_REPOSITORY,
  type RecurrenceRepository,
} from '../../domain/repositories/recurrence.repository';
import { RecurrenceOccurrenceGenerator } from '../services/recurrence-occurrence-generator';
import { RecurrenceReferences } from '../services/recurrence-references';

export interface CreateRecurrenceInput {
  ownerId: number;
  type: RecurrenceType;
  description: string;
  amount: number;
  frequency: RecurrenceFrequency;
  startDate: string;
  endDate?: string | null;
  accountUuid?: string;
  creditCardUuid?: string;
  categoryUuid: string;
  notes?: string | null;
}

@Injectable()
export class CreateRecurrenceUseCase {
  constructor(
    @Inject(RECURRENCE_REPOSITORY)
    private readonly recurrenceRepository: RecurrenceRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
    private readonly references: RecurrenceReferences,
    private readonly generator: RecurrenceOccurrenceGenerator,
  ) {}

  async execute(input: CreateRecurrenceInput): Promise<RecurrenceEntity> {
    return this.transactionManager.runInTransaction(async () => {
      await this.references.lockOwnerFinances(input.ownerId);

      const recurrence = await this.recurrenceRepository.create(
        RecurrenceEntity.create({
          uuid: randomUUID(),
          ownerId: input.ownerId,
          type: input.type,
          description: input.description,
          amount: input.amount,
          frequency: input.frequency,
          startDate: input.startDate,
          endDate: input.endDate ?? null,
          account: input.accountUuid
            ? await this.references.activeAccount(
                input.accountUuid,
                input.ownerId,
              )
            : null,
          creditCard: input.creditCardUuid
            ? await this.references.activeCard(
                input.creditCardUuid,
                input.ownerId,
              )
            : null,
          category: await this.references.activeCategory(
            input.categoryUuid,
            input.ownerId,
          ),
          notes: input.notes ?? null,
        }),
      );

      return this.generator.generate(recurrence, financeToday());
    });
  }
}
