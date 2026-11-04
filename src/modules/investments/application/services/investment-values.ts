import { Inject, Injectable } from '@nestjs/common';
import { InvestmentEntity } from '../../domain/entities/investment.entity';
import { InvestmentInsufficientValueError } from '../../domain/errors/investment-insufficient-value.error';
import {
  INVESTMENT_MOVEMENT_REPOSITORY,
  type InvestmentMovementRepository,
} from '../../domain/repositories/investment-movement.repository';
import {
  EMPTY_INVESTMENT_TOTALS,
  investmentValueOf,
  type InvestmentValue,
} from '../../domain/valuation/investment-value';

export interface InvestmentWithValue {
  investment: InvestmentEntity;
  value: InvestmentValue;
}

@Injectable()
export class InvestmentValues {
  constructor(
    @Inject(INVESTMENT_MOVEMENT_REPOSITORY)
    private readonly movementRepository: InvestmentMovementRepository,
  ) {}

  async withValues(
    investments: readonly InvestmentEntity[],
  ): Promise<InvestmentWithValue[]> {
    if (investments.length === 0) {
      return [];
    }

    const totals = await this.movementRepository.sumTotalsByInvestment(
      investments[0].ownerId,
      investments.map((investment) => investment.id),
    );

    return investments.map((investment) => ({
      investment,
      value: investmentValueOf(
        totals.get(investment.id) ?? EMPTY_INVESTMENT_TOTALS,
      ),
    }));
  }

  async withValue(investment: InvestmentEntity): Promise<InvestmentWithValue> {
    const [withValue] = await this.withValues([investment]);

    return withValue;
  }

  async currentValue(investment: InvestmentEntity): Promise<number> {
    return (await this.withValue(investment)).value.current;
  }

  async assertCanChangeBy(
    investment: InvestmentEntity,
    change: number,
  ): Promise<void> {
    if (change < 0 && (await this.currentValue(investment)) + change < 0) {
      throw new InvestmentInsufficientValueError();
    }
  }
}
