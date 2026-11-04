import { Inject, Injectable } from '@nestjs/common';
import {
  summarizePendingOperations,
  type PendingOperationsSummary,
} from '@shared/domain/pending-operations';
import {
  INVESTMENT_MOVEMENT_REPOSITORY,
  type InvestmentMovementRepository,
} from '../../domain/repositories/investment-movement.repository';
import {
  INVESTMENT_REPOSITORY,
  type InvestmentRepository,
} from '../../domain/repositories/investment.repository';
import { findOwnedInvestment } from '../services/investment-references';

@Injectable()
export class GetInvestmentPendingOperationsUseCase {
  constructor(
    @Inject(INVESTMENT_REPOSITORY)
    private readonly investmentRepository: InvestmentRepository,
    @Inject(INVESTMENT_MOVEMENT_REPOSITORY)
    private readonly movementRepository: InvestmentMovementRepository,
  ) {}

  async execute(
    uuid: string,
    ownerId: number,
  ): Promise<PendingOperationsSummary> {
    const investment = await findOwnedInvestment(
      this.investmentRepository,
      uuid,
      ownerId,
    );

    const planned = await this.movementRepository.findPlannedByInvestment(
      ownerId,
      investment.id,
    );

    return summarizePendingOperations(planned.map(({ amount }) => amount));
  }
}
