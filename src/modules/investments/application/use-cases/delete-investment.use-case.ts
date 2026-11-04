import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { InvestmentHasHistoryError } from '../../domain/errors/investment-has-history.error';
import {
  INVESTMENT_MOVEMENT_REPOSITORY,
  type InvestmentMovementRepository,
} from '../../domain/repositories/investment-movement.repository';
import {
  INVESTMENT_REPOSITORY,
  type InvestmentRepository,
} from '../../domain/repositories/investment.repository';
import { findOwnedInvestment } from '../services/investment-references';

export interface DeleteInvestmentInput {
  uuid: string;
  ownerId: number;
}

@Injectable()
export class DeleteInvestmentUseCase {
  constructor(
    @Inject(INVESTMENT_REPOSITORY)
    private readonly investmentRepository: InvestmentRepository,
    @Inject(INVESTMENT_MOVEMENT_REPOSITORY)
    private readonly movementRepository: InvestmentMovementRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
  ) {}

  async execute(input: DeleteInvestmentInput): Promise<void> {
    await this.transactionManager.runInTransaction(async () => {
      await this.investmentRepository.lockOwnerInvestments(input.ownerId);

      const investment = await findOwnedInvestment(
        this.investmentRepository,
        input.uuid,
        input.ownerId,
      );

      if (
        await this.movementRepository.existsForInvestment(
          input.ownerId,
          investment.id,
        )
      ) {
        throw new InvestmentHasHistoryError();
      }

      await this.investmentRepository.softDelete(investment);
    });
  }
}
