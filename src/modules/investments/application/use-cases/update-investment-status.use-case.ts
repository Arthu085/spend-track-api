import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { PendingOperationsDecision } from '@shared/domain/pending-operations';
import type { InvestmentEntity } from '../../domain/entities/investment.entity';
import { InvestmentPendingOperationsDecisionRequiredError } from '../../domain/errors/investment-pending-operations-decision-required.error';
import {
  INVESTMENT_MOVEMENT_REPOSITORY,
  type InvestmentMovementRepository,
} from '../../domain/repositories/investment-movement.repository';
import {
  INVESTMENT_REPOSITORY,
  type InvestmentRepository,
} from '../../domain/repositories/investment.repository';
import { InvestmentLifecycle } from '../services/investment-lifecycle';
import { findOwnedInvestment } from '../services/investment-references';
import {
  InvestmentValues,
  type InvestmentWithValue,
} from '../services/investment-values';

export interface UpdateInvestmentStatusInput {
  uuid: string;
  ownerId: number;
  status: RecordStatus;
  pendingOperations?: PendingOperationsDecision;
}

@Injectable()
export class UpdateInvestmentStatusUseCase {
  constructor(
    @Inject(INVESTMENT_REPOSITORY)
    private readonly investmentRepository: InvestmentRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
    private readonly values: InvestmentValues,
    @Inject(INVESTMENT_MOVEMENT_REPOSITORY)
    private readonly movementRepository: InvestmentMovementRepository,
    private readonly lifecycle: InvestmentLifecycle,
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

      if (
        investment.status === RecordStatus.ACTIVE &&
        input.status === RecordStatus.INACTIVE
      ) {
        await this.settlePendingOperations(investment, input.pendingOperations);
        await this.lifecycle.archive(
          input.ownerId,
          investment.id,
          input.pendingOperations,
        );
      }

      return this.investmentRepository.update(
        investment.withStatus(input.status),
      );
    });

    return this.values.withValue(updated);
  }

  private async settlePendingOperations(
    investment: InvestmentEntity,
    decision: PendingOperationsDecision | undefined,
  ): Promise<void> {
    if (decision === PendingOperationsDecision.KEEP) {
      return;
    }

    const planned = await this.movementRepository.findPlannedByInvestment(
      investment.ownerId,
      investment.id,
    );

    if (decision === undefined && planned.length > 0) {
      throw new InvestmentPendingOperationsDecisionRequiredError();
    }

    for (const movement of planned) {
      await this.movementRepository.update(movement.cancel());
    }
  }
}
