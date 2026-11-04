import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  InvestmentEntity,
  type InvestmentDetails,
} from '../../domain/entities/investment.entity';
import {
  INVESTMENT_REPOSITORY,
  type InvestmentRepository,
} from '../../domain/repositories/investment.repository';
import {
  InvestmentValues,
  type InvestmentWithValue,
} from '../services/investment-values';

export interface CreateInvestmentInput extends InvestmentDetails {
  ownerId: number;
}

@Injectable()
export class CreateInvestmentUseCase {
  constructor(
    @Inject(INVESTMENT_REPOSITORY)
    private readonly investmentRepository: InvestmentRepository,
    private readonly values: InvestmentValues,
  ) {}

  async execute(input: CreateInvestmentInput): Promise<InvestmentWithValue> {
    const investment = await this.investmentRepository.create(
      InvestmentEntity.create({ ...input, uuid: randomUUID() }),
    );

    return this.values.withValue(investment);
  }
}
