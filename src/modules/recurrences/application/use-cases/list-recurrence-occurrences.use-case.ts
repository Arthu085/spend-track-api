import { Injectable } from '@nestjs/common';
import type { RecurrenceOccurrenceFilters } from '@modules/transactions';
import { PaginatedResult } from '@shared/application/dto';
import type { RecurrenceOccurrence } from '../services/recurrence-occurrence';
import { RecurrenceOccurrences } from '../services/recurrence-occurrences';
import { RecurrenceReferences } from '../services/recurrence-references';

export interface ListRecurrenceOccurrencesInput extends RecurrenceOccurrenceFilters {
  uuid: string;
  ownerId: number;
  page: number;
  limit: number;
}

@Injectable()
export class ListRecurrenceOccurrencesUseCase {
  constructor(
    private readonly references: RecurrenceReferences,
    private readonly occurrences: RecurrenceOccurrences,
  ) {}

  async execute(
    input: ListRecurrenceOccurrencesInput,
  ): Promise<PaginatedResult<RecurrenceOccurrence>> {
    const recurrence = await this.references.findRecurrence(
      input.uuid,
      input.ownerId,
    );

    const { items, total } = await this.occurrences.list(
      recurrence,
      (input.page - 1) * input.limit,
      input.limit,
      { from: input.from, to: input.to, state: input.state },
    );

    return PaginatedResult.of(items, total, input.page, input.limit);
  }
}
