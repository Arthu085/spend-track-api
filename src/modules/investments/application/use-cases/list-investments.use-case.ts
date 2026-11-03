import { Inject, Injectable } from '@nestjs/common';
import { PaginatedResult } from '@shared/application/dto';
import { normalizeTextFilter } from '@shared/application/filters';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { InvestmentType } from '../../domain/enums/investment-type.enum';
import {
  INVESTMENT_REPOSITORY,
  type InvestmentRepository,
} from '../../domain/repositories/investment.repository';
import {
  InvestmentValues,
  type InvestmentWithValue,
} from '../services/investment-values';

export interface ListInvestmentsInput {
  ownerId: number;
  page: number;
  limit: number;
  name?: string;
  type?: InvestmentType;
  status?: RecordStatus;
}

@Injectable()
export class ListInvestmentsUseCase {
  constructor(
    @Inject(INVESTMENT_REPOSITORY)
    private readonly investmentRepository: InvestmentRepository,
    private readonly values: InvestmentValues,
  ) {}

  async execute(
    input: ListInvestmentsInput,
  ): Promise<PaginatedResult<InvestmentWithValue>> {
    const { items, total } =
      await this.investmentRepository.findAllPaginatedByOwner(
        input.ownerId,
        (input.page - 1) * input.limit,
        input.limit,
        {
          name: normalizeTextFilter(input.name),
          type: input.type,
          status: input.status ?? RecordStatus.ACTIVE,
        },
      );

    return PaginatedResult.of(
      await this.values.withValues(items),
      total,
      input.page,
      input.limit,
    );
  }
}
