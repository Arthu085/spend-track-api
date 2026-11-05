import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountsModule } from '@modules/accounts/accounts.module';
import { InvestmentLifecycle } from './application/services/investment-lifecycle';
import { InvestmentMovementLedger } from './application/services/investment-movement-ledger';
import { InvestmentValues } from './application/services/investment-values';
import { CreateInvestmentMovementUseCase } from './application/use-cases/create-investment-movement.use-case';
import { CreateInvestmentValuationUseCase } from './application/use-cases/create-investment-valuation.use-case';
import { CreateInvestmentUseCase } from './application/use-cases/create-investment.use-case';
import { DeleteInvestmentUseCase } from './application/use-cases/delete-investment.use-case';
import { GetInvestmentPendingOperationsUseCase } from './application/use-cases/get-investment-pending-operations.use-case';
import { GetInvestmentUseCase } from './application/use-cases/get-investment.use-case';
import { ListInvestmentMovementsUseCase } from './application/use-cases/list-investment-movements.use-case';
import { ListInvestmentsUseCase } from './application/use-cases/list-investments.use-case';
import { UpdateInvestmentMovementStateUseCase } from './application/use-cases/update-investment-movement-state.use-case';
import { UpdateInvestmentStatusUseCase } from './application/use-cases/update-investment-status.use-case';
import { UpdateInvestmentUseCase } from './application/use-cases/update-investment.use-case';
import { INVESTMENT_MOVEMENT_REPOSITORY } from './domain/repositories/investment-movement.repository';
import { INVESTMENT_REPOSITORY } from './domain/repositories/investment.repository';
import { InvestmentMovementOrmEntity } from './infrastructure/persistence/entities/investment-movement.orm-entity';
import { InvestmentOrmEntity } from './infrastructure/persistence/entities/investment.orm-entity';
import { TypeOrmInvestmentMovementRepository } from './infrastructure/persistence/repositories/typeorm-investment-movement.repository';
import { TypeOrmInvestmentRepository } from './infrastructure/persistence/repositories/typeorm-investment.repository';
import { InvestmentMovementsController } from './presentation/controllers/investment-movements.controller';
import { InvestmentsController } from './presentation/controllers/investments.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InvestmentOrmEntity,
      InvestmentMovementOrmEntity,
    ]),
    AccountsModule,
  ],
  controllers: [InvestmentsController, InvestmentMovementsController],
  providers: [
    { provide: INVESTMENT_REPOSITORY, useClass: TypeOrmInvestmentRepository },
    {
      provide: INVESTMENT_MOVEMENT_REPOSITORY,
      useClass: TypeOrmInvestmentMovementRepository,
    },
    InvestmentLifecycle,
    InvestmentValues,
    InvestmentMovementLedger,
    ListInvestmentsUseCase,
    GetInvestmentUseCase,
    GetInvestmentPendingOperationsUseCase,
    CreateInvestmentUseCase,
    UpdateInvestmentUseCase,
    UpdateInvestmentStatusUseCase,
    DeleteInvestmentUseCase,
    ListInvestmentMovementsUseCase,
    CreateInvestmentMovementUseCase,
    CreateInvestmentValuationUseCase,
    UpdateInvestmentMovementStateUseCase,
  ],
  exports: [
    INVESTMENT_REPOSITORY,
    INVESTMENT_MOVEMENT_REPOSITORY,
    InvestmentLifecycle,
    InvestmentValues,
  ],
})
export class InvestmentsModule {}
