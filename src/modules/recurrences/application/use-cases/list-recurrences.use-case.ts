import { Inject, Injectable } from '@nestjs/common';
import { PaginatedResult } from '@shared/application/dto';
import { normalizeTextFilter } from '@shared/application/filters';
import { financeToday } from '@shared/domain/calendar';
import { RecurrenceEntity } from '../../domain/entities/recurrence.entity';
import {
  RECURRENCE_REPOSITORY,
  type RecurrenceListFilters,
  type RecurrenceRepository,
} from '../../domain/repositories/recurrence.repository';

export interface ListRecurrencesInput extends RecurrenceListFilters {
  ownerId: number;
  page: number;
  limit: number;
}

@Injectable()
export class ListRecurrencesUseCase {
  constructor(
    @Inject(RECURRENCE_REPOSITORY)
    private readonly recurrenceRepository: RecurrenceRepository,
  ) {}

  async execute(
    input: ListRecurrencesInput,
  ): Promise<PaginatedResult<RecurrenceEntity>> {
    const { items, total } =
      await this.recurrenceRepository.findAllPaginatedByOwner(
        input.ownerId,
        (input.page - 1) * input.limit,
        input.limit,
        financeToday(),
        {
          state: input.state,
          type: input.type,
          description: normalizeTextFilter(input.description),
        },
      );

    return PaginatedResult.of(items, total, input.page, input.limit);
  }
}
