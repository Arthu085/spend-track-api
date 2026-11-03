import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountsModule } from '@modules/accounts/accounts.module';
import { CreditCardsModule } from '@modules/credit-cards/credit-cards.module';
import { TransactionCategoriesModule } from '@modules/transaction-categories/transaction-categories.module';
import { TransactionsModule } from '@modules/transactions/transactions.module';
import { RecurrenceOccurrenceGenerator } from './application/services/recurrence-occurrence-generator';
import { RecurrenceOccurrences } from './application/services/recurrence-occurrences';
import { RecurrenceReferences } from './application/services/recurrence-references';
import { CancelRecurrenceOccurrenceUseCase } from './application/use-cases/cancel-recurrence-occurrence.use-case';
import { ConfirmRecurrenceOccurrenceUseCase } from './application/use-cases/confirm-recurrence-occurrence.use-case';
import { CreateRecurrenceUseCase } from './application/use-cases/create-recurrence.use-case';
import { EndRecurrenceUseCase } from './application/use-cases/end-recurrence.use-case';
import { GenerateDueRecurrenceOccurrencesUseCase } from './application/use-cases/generate-due-recurrence-occurrences.use-case';
import { GetRecurrenceUseCase } from './application/use-cases/get-recurrence.use-case';
import { ListRecurrenceOccurrencesUseCase } from './application/use-cases/list-recurrence-occurrences.use-case';
import { ListRecurrencesUseCase } from './application/use-cases/list-recurrences.use-case';
import { UpdateRecurrenceOccurrenceUseCase } from './application/use-cases/update-recurrence-occurrence.use-case';
import { UpdateRecurrenceStateUseCase } from './application/use-cases/update-recurrence-state.use-case';
import { UpdateRecurrenceUseCase } from './application/use-cases/update-recurrence.use-case';
import { RECURRENCE_CARD_CHARGE_REPOSITORY } from './domain/repositories/recurrence-card-charge.repository';
import { RECURRENCE_REPOSITORY } from './domain/repositories/recurrence.repository';
import { RecurrenceCardChargeOrmEntity } from './infrastructure/persistence/entities/recurrence-card-charge.orm-entity';
import { RecurrenceOrmEntity } from './infrastructure/persistence/entities/recurrence.orm-entity';
import { TypeOrmRecurrenceCardChargeRepository } from './infrastructure/persistence/repositories/typeorm-recurrence-card-charge.repository';
import { TypeOrmRecurrenceRepository } from './infrastructure/persistence/repositories/typeorm-recurrence.repository';
import { RecurrenceGenerationScheduler } from './infrastructure/scheduling/recurrence-generation.scheduler';
import { RecurrenceOccurrencesController } from './presentation/controllers/recurrence-occurrences.controller';
import { RecurrencesController } from './presentation/controllers/recurrences.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RecurrenceOrmEntity,
      RecurrenceCardChargeOrmEntity,
    ]),
    AccountsModule,
    CreditCardsModule,
    TransactionCategoriesModule,
    TransactionsModule,
  ],
  controllers: [RecurrencesController, RecurrenceOccurrencesController],
  providers: [
    { provide: RECURRENCE_REPOSITORY, useClass: TypeOrmRecurrenceRepository },
    {
      provide: RECURRENCE_CARD_CHARGE_REPOSITORY,
      useClass: TypeOrmRecurrenceCardChargeRepository,
    },
    RecurrenceReferences,
    RecurrenceOccurrences,
    RecurrenceOccurrenceGenerator,
    ListRecurrencesUseCase,
    GetRecurrenceUseCase,
    ListRecurrenceOccurrencesUseCase,
    CreateRecurrenceUseCase,
    UpdateRecurrenceUseCase,
    UpdateRecurrenceOccurrenceUseCase,
    UpdateRecurrenceStateUseCase,
    EndRecurrenceUseCase,
    ConfirmRecurrenceOccurrenceUseCase,
    CancelRecurrenceOccurrenceUseCase,
    GenerateDueRecurrenceOccurrencesUseCase,
    RecurrenceGenerationScheduler,
  ],
  exports: [RECURRENCE_CARD_CHARGE_REPOSITORY],
})
export class RecurrencesModule {}
