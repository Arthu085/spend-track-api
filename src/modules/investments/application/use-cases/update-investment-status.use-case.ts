import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import {
  INVESTMENT_REPOSITORY,
  type InvestmentRepository,
} from '../../domain/repositories/investment.repository';
import { findOwnedInvestment } from '../services/investment-references';
import {
  InvestmentValues,
  type InvestmentWithValue,
} from '../services/investment-values';

export interface UpdateInvestmentStatusInput {
  uuid: string;
  ownerId: number;
  status: RecordStatus;
}

@Injectable()
export class UpdateInvestmentStatusUseCase {
  constructor(
    @Inject(INVESTMENT_REPOSITORY)
    private readonly investmentRepository: InvestmentRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
    private readonly values: InvestmentValues,
  ) {}

  async execute(
    input: UpdateInvestmentStatusInput,
  ): Promise<InvestmentWithValue> {
    const updated = await this.transactionManager.runInTransaction(async () => {
      await this.investmentRepository.lockOwnerInvestments(input.ownerId);

      const investment = await findOwnedInvestment(
        this.investmentRepository,
        input.uuid,
        input.ownerId,
      );

      return this.investmentRepository.update(
        investment.withStatus(input.status),
      );
    });

    return this.values.withValue(updated);
  }
}
