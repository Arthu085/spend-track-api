import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import type { InvestmentDetails } from '../../domain/entities/investment.entity';
import {
  INVESTMENT_REPOSITORY,
  type InvestmentRepository,
} from '../../domain/repositories/investment.repository';
import { findActiveInvestment } from '../services/investment-references';
import {
  InvestmentValues,
  type InvestmentWithValue,
} from '../services/investment-values';

export interface UpdateInvestmentInput extends Partial<InvestmentDetails> {
  uuid: string;
  ownerId: number;
}

@Injectable()
export class UpdateInvestmentUseCase {
  constructor(
    @Inject(INVESTMENT_REPOSITORY)
    private readonly investmentRepository: InvestmentRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
    private readonly values: InvestmentValues,
  ) {}

  async execute(input: UpdateInvestmentInput): Promise<InvestmentWithValue> {
    const updated = await this.transactionManager.runInTransaction(async () => {
      await this.investmentRepository.lockOwnerInvestments(input.ownerId);

      const investment = await findActiveInvestment(
        this.investmentRepository,
        input.uuid,
        input.ownerId,
      );

      return this.investmentRepository.update(
        investment.withDetails({
          name: input.name ?? investment.name,
          type: input.type ?? investment.type,
          targetAmount:
            input.targetAmount === undefined
              ? investment.targetAmount
              : input.targetAmount,
        }),
      );
    });

    return this.values.withValue(updated);
  }
}
