import { Inject, Injectable } from '@nestjs/common';
import { PaginatedResult } from '@shared/application/dto';
import { InvestmentMovementEntity } from '../../domain/entities/investment-movement.entity';
import {
  INVESTMENT_MOVEMENT_REPOSITORY,
  type InvestmentMovementRepository,
} from '../../domain/repositories/investment-movement.repository';
import {
  INVESTMENT_REPOSITORY,
  type InvestmentRepository,
} from '../../domain/repositories/investment.repository';
import { findOwnedInvestment } from '../services/investment-references';

export interface ListInvestmentMovementsInput {
  investmentUuid: string;
  ownerId: number;
  page: number;
  limit: number;
}

@Injectable()
export class ListInvestmentMovementsUseCase {
  constructor(
    @Inject(INVESTMENT_REPOSITORY)
    private readonly investmentRepository: InvestmentRepository,
    @Inject(INVESTMENT_MOVEMENT_REPOSITORY)
    private readonly movementRepository: InvestmentMovementRepository,
  ) {}

  async execute(
    input: ListInvestmentMovementsInput,
  ): Promise<PaginatedResult<InvestmentMovementEntity>> {
    const investment = await findOwnedInvestment(
      this.investmentRepository,
      input.investmentUuid,
      input.ownerId,
    );

    const { items, total } =
      await this.movementRepository.findPaginatedByInvestment(
        input.ownerId,
        investment.id,
        (input.page - 1) * input.limit,
        input.limit,
      );

    return PaginatedResult.of(items, total, input.page, input.limit);
  }
}
