import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionCategoriesModule } from '@modules/transaction-categories/transaction-categories.module';
import { DeleteBudgetUseCase } from './application/use-cases/delete-budget.use-case';
import { GetBudgetUseCase } from './application/use-cases/get-budget.use-case';
import { SaveBudgetUseCase } from './application/use-cases/save-budget.use-case';
import { BUDGET_REPOSITORY } from './domain/repositories/budget.repository';
import { BudgetCategoryLimitOrmEntity } from './infrastructure/persistence/entities/budget-category-limit.orm-entity';
import { BudgetOrmEntity } from './infrastructure/persistence/entities/budget.orm-entity';
import { TypeOrmBudgetRepository } from './infrastructure/persistence/repositories/typeorm-budget.repository';
import { BudgetsController } from './presentation/controllers/budgets.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([BudgetOrmEntity, BudgetCategoryLimitOrmEntity]),
    TransactionCategoriesModule,
  ],
  controllers: [BudgetsController],
  providers: [
    { provide: BUDGET_REPOSITORY, useClass: TypeOrmBudgetRepository },
    GetBudgetUseCase,
    SaveBudgetUseCase,
    DeleteBudgetUseCase,
  ],
  exports: [BUDGET_REPOSITORY],
})
export class BudgetsModule {}
