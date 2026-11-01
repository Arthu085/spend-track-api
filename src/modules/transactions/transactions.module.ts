import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountsModule } from '@modules/accounts/accounts.module';
import { TransactionCategoriesModule } from '@modules/transaction-categories/transaction-categories.module';
import { TransactionAccountLedger } from './application/services/transaction-account-ledger';
import { CreateTransactionUseCase } from './application/use-cases/create-transaction.use-case';
import { DeleteTransactionUseCase } from './application/use-cases/delete-transaction.use-case';
import { GetTransactionUseCase } from './application/use-cases/get-transaction.use-case';
import { ListTransactionsUseCase } from './application/use-cases/list-transactions.use-case';
import { UpdateTransactionStateUseCase } from './application/use-cases/update-transaction-state.use-case';
import { UpdateTransactionUseCase } from './application/use-cases/update-transaction.use-case';
import { TRANSACTION_REPOSITORY } from './domain/repositories/transaction.repository';
import { TransactionOrmEntity } from './infrastructure/persistence/entities/transaction.orm-entity';
import { TypeOrmTransactionRepository } from './infrastructure/persistence/repositories/typeorm-transaction.repository';
import { TransactionsController } from './presentation/controllers/transactions.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([TransactionOrmEntity]),
    AccountsModule,
    TransactionCategoriesModule,
  ],
  controllers: [TransactionsController],
  providers: [
    {
      provide: TRANSACTION_REPOSITORY,
      useClass: TypeOrmTransactionRepository,
    },
    TransactionAccountLedger,
    ListTransactionsUseCase,
    GetTransactionUseCase,
    CreateTransactionUseCase,
    UpdateTransactionUseCase,
    UpdateTransactionStateUseCase,
    DeleteTransactionUseCase,
  ],
  exports: [TRANSACTION_REPOSITORY],
})
export class TransactionsModule {}
