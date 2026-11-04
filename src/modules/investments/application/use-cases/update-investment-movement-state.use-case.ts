import { Inject, Injectable } from '@nestjs/common';
import {
  ACCOUNT_REPOSITORY,
  InactiveAccountError,
  assertNotBeforeOpening,
  type AccountRepository,
} from '@modules/accounts';
import { TransactionState } from '@modules/transactions';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { financeToday } from '@shared/domain/calendar';
import { assertRecordActive } from '@shared/domain/policies';
import { InvestmentMovementEntity } from '../../domain/entities/investment-movement.entity';
import {
  INVESTMENT_MOVEMENT_REPOSITORY,
  type InvestmentMovementRepository,
} from '../../domain/repositories/investment-movement.repository';
import {
  INVESTMENT_REPOSITORY,
  type InvestmentRepository,
} from '../../domain/repositories/investment.repository';
import {
  findInvestmentMovement,
  findOwnedInvestment,
} from '../services/investment-references';
import { InvestmentValues } from '../services/investment-values';

export interface UpdateInvestmentMovementStateInput {
  investmentUuid: string;
  movementUuid: string;
  ownerId: number;
  state: TransactionState.COMPLETED | TransactionState.CANCELED;
  completedOn?: string;
}

@Injectable()
export class UpdateInvestmentMovementStateUseCase {
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
    input: UpdateInvestmentMovementStateInput,
  ): Promise<InvestmentMovementEntity> {
    return this.transactionManager.runInTransaction(async () => {
      await this.accountRepository.lockOwnerAccounts(input.ownerId);
      await this.investmentRepository.lockOwnerInvestments(input.ownerId);

      const investment = await findOwnedInvestment(
        this.investmentRepository,
        input.investmentUuid,
        input.ownerId,
      );

      const movement = await findInvestmentMovement(
        this.movementRepository,
        input.movementUuid,
        investment,
      );

      const changed =
        input.state === TransactionState.COMPLETED
          ? this.complete(movement, input.completedOn ?? financeToday())
          : movement.cancel();

      await this.values.assertCanChangeBy(
        investment,
        changed.valueChange - movement.valueChange,
      );

      return this.movementRepository.update(changed);
    });
  }

  private complete(
    movement: InvestmentMovementEntity,
    completedOn: string,
  ): InvestmentMovementEntity {
    const completed = movement.complete(completedOn);

    if (movement.account) {
      assertRecordActive(movement.account, new InactiveAccountError());
    }

    assertNotBeforeOpening([movement.account], [movement.date, completedOn]);

    return completed;
  }
}
