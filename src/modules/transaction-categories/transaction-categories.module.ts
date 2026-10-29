import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreateTransactionCategoryUseCase } from './application/use-cases/create-transaction-category.use-case';
import { DeleteTransactionCategoryUseCase } from './application/use-cases/delete-transaction-category.use-case';
import { GetTransactionCategoryUseCase } from './application/use-cases/get-transaction-category.use-case';
import { ListTransactionCategoriesUseCase } from './application/use-cases/list-transaction-categories.use-case';
import { UpdateTransactionCategoryStatusUseCase } from './application/use-cases/update-transaction-category-status.use-case';
import { UpdateTransactionCategoryUseCase } from './application/use-cases/update-transaction-category.use-case';
import { TRANSACTION_CATEGORY_REPOSITORY } from './domain/repositories/transaction-category.repository';
import { TransactionCategoryOrmEntity } from './infrastructure/persistence/entities/transaction-category.orm-entity';
import { TypeOrmTransactionCategoryRepository } from './infrastructure/persistence/repositories/typeorm-transaction-category.repository';
import { TransactionCategoriesController } from './presentation/controllers/transaction-categories.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TransactionCategoryOrmEntity])],
  controllers: [TransactionCategoriesController],
  providers: [
    {
      provide: TRANSACTION_CATEGORY_REPOSITORY,
      useClass: TypeOrmTransactionCategoryRepository,
    },
    ListTransactionCategoriesUseCase,
    GetTransactionCategoryUseCase,
    CreateTransactionCategoryUseCase,
    UpdateTransactionCategoryUseCase,
    UpdateTransactionCategoryStatusUseCase,
    DeleteTransactionCategoryUseCase,
  ],
  exports: [TRANSACTION_CATEGORY_REPOSITORY],
})
export class TransactionCategoriesModule {}
