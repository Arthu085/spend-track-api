import { Inject, Injectable } from '@nestjs/common';
import {
  INVESTMENT_REPOSITORY,
  type InvestmentRepository,
} from '../../domain/repositories/investment.repository';
import { findActiveInvestment } from '../services/investment-references';
import {
  InvestmentValues,
  type InvestmentWithValue,
} from '../services/investment-values';

@Injectable()
export class GetInvestmentUseCase {
  constructor(
    @Inject(INVESTMENT_REPOSITORY)
    private readonly investmentRepository: InvestmentRepository,
    private readonly values: InvestmentValues,
  ) {}

  async execute(uuid: string, ownerId: number): Promise<InvestmentWithValue> {
    return this.values.withValue(
      await findActiveInvestment(this.investmentRepository, uuid, ownerId),
    );
  }
}
