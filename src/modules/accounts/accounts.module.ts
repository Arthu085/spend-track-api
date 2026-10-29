import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ACCOUNT_LEDGERS } from './application/ports/account-ledger.port';
import { AccountLedgers } from './application/services/account-ledgers';
import { CreateAccountUseCase } from './application/use-cases/create-account.use-case';
import { DeleteAccountUseCase } from './application/use-cases/delete-account.use-case';
import { GetAccountUseCase } from './application/use-cases/get-account.use-case';
import { ListAccountsUseCase } from './application/use-cases/list-accounts.use-case';
import { UpdateAccountStatusUseCase } from './application/use-cases/update-account-status.use-case';
import { UpdateAccountUseCase } from './application/use-cases/update-account.use-case';
import { ACCOUNT_REPOSITORY } from './domain/repositories/account.repository';
import { AccountOrmEntity } from './infrastructure/persistence/entities/account.orm-entity';
import { TypeOrmAccountRepository } from './infrastructure/persistence/repositories/typeorm-account.repository';
import { AccountsController } from './presentation/controllers/accounts.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AccountOrmEntity])],
  controllers: [AccountsController],
  providers: [
    { provide: ACCOUNT_REPOSITORY, useClass: TypeOrmAccountRepository },
    { provide: ACCOUNT_LEDGERS, useClass: AccountLedgers },
    ListAccountsUseCase,
    GetAccountUseCase,
    CreateAccountUseCase,
    UpdateAccountUseCase,
    UpdateAccountStatusUseCase,
    DeleteAccountUseCase,
  ],
  exports: [ACCOUNT_REPOSITORY, ACCOUNT_LEDGERS],
})
export class AccountsModule {}
