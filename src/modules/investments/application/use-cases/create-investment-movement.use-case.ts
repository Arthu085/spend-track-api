import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ACCOUNT_REPOSITORY, type AccountRepository } from '@modules/accounts';
import type { TransactionState } from '@modules/transactions';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { InvestmentMovementEntity } from '../../domain/entities/investment-movement.entity';
import type { InvestmentMovementType } from '../../domain/enums/investment-movement-type.enum';
import {
  INVESTMENT_MOVEMENT_REPOSITORY,
  type InvestmentMovementRepository,
} from '../../domain/repositories/investment-movement.repository';
import {
  INVESTMENT_REPOSITORY,
  type InvestmentRepository,
} from '../../domain/repositories/investment.repository';
import {
  findActiveAccount,
  findActiveInvestment,
} from '../services/investment-references';
import { InvestmentValues } from '../services/investment-values';

export interface CreateInvestmentMovementInput {
  investmentUuid: string;
  ownerId: number;
  type: InvestmentMovementType.CONTRIBUTION | InvestmentMovementType.WITHDRAWAL;
  accountUuid: string;
  amount: number;
  date: string;
  state: TransactionState.PLANNED | TransactionState.COMPLETED;
  completedOn?: string;
}

@Injectable()
export class CreateInvestmentMovementUseCase {
  constructor(
    @Inject(INVESTMENT_REPOSITORY)
    private readonly investmentRepository: InvestmentRepository,
    @Inject(INVESTMENT_MOVEMENT_REPOSITORY)
    private readonly movementRepository: InvestmentMovementRepository,
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: AccountRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
    private readonly values: InvestmentValues,
  ) {}

  async execute(
    input: CreateInvestmentMovementInput,
  ): Promise<InvestmentMovementEntity> {
    return this.transactionManager.runInTransaction(async () => {
      await this.accountRepository.lockOwnerAccounts(input.ownerId);
      await this.investmentRepository.lockOwnerInvestments(input.ownerId);

      const investment = await findActiveInvestment(
        this.investmentRepository,
        input.investmentUuid,
        input.ownerId,
      );

      const account = await findActiveAccount(
        this.accountRepository,
        input.accountUuid,
        input.ownerId,
      );

      const movement = InvestmentMovementEntity.createTransfer({
        uuid: randomUUID(),
        ownerId: input.ownerId,
        investmentId: investment.id,
        type: input.type,
        account,
        amount: input.amount,
        date: input.date,
        state: input.state,
        completedOn: input.completedOn ?? null,
      });

      await this.values.assertCanChangeBy(investment, movement.valueChange);

      return this.movementRepository.create(movement);
    });
  }
}
