import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { financeToday } from '@shared/domain/calendar';
import { InvestmentMovementEntity } from '../../domain/entities/investment-movement.entity';
import { InvestmentValuationUnchangedError } from '../../domain/errors/investment-valuation-unchanged.error';
import {
  INVESTMENT_MOVEMENT_REPOSITORY,
  type InvestmentMovementRepository,
} from '../../domain/repositories/investment-movement.repository';
import {
  INVESTMENT_REPOSITORY,
  type InvestmentRepository,
} from '../../domain/repositories/investment.repository';
import { findActiveInvestment } from '../services/investment-references';
import { InvestmentValues } from '../services/investment-values';

export interface CreateInvestmentValuationInput {
  investmentUuid: string;
  ownerId: number;
  value: number;
  date?: string;
}

@Injectable()
export class CreateInvestmentValuationUseCase {
  constructor(
    @Inject(INVESTMENT_REPOSITORY)
    private readonly investmentRepository: InvestmentRepository,
    @Inject(INVESTMENT_MOVEMENT_REPOSITORY)
    private readonly movementRepository: InvestmentMovementRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
    private readonly values: InvestmentValues,
  ) {}

  async execute(
    input: CreateInvestmentValuationInput,
  ): Promise<InvestmentMovementEntity> {
    return this.transactionManager.runInTransaction(async () => {
      await this.investmentRepository.lockOwnerInvestments(input.ownerId);

      const investment = await findActiveInvestment(
        this.investmentRepository,
        input.investmentUuid,
        input.ownerId,
      );

      const change = input.value - (await this.values.currentValue(investment));

      if (change === 0) {
        throw new InvestmentValuationUnchangedError();
      }

      return this.movementRepository.create(
        InvestmentMovementEntity.createValuation({
          uuid: randomUUID(),
          ownerId: input.ownerId,
          investmentId: investment.id,
          change,
          date: input.date ?? financeToday(),
        }),
      );
    });
  }
}
