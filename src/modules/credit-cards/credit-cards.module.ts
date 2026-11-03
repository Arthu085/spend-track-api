import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountsModule } from '@modules/accounts/accounts.module';
import { TransactionCategoriesModule } from '@modules/transaction-categories/transaction-categories.module';
import { CreditCardInvoiceAssigner } from './application/services/credit-card-invoice-assigner';
import { CreditCardPaymentLedger } from './application/services/credit-card-payment-ledger';
import { CreditCardStatements } from './application/services/credit-card-statements';
import { CancelCreditCardPaymentUseCase } from './application/use-cases/cancel-credit-card-payment.use-case';
import { CreateCreditCardPurchaseUseCase } from './application/use-cases/create-credit-card-purchase.use-case';
import { CreateCreditCardRefundUseCase } from './application/use-cases/create-credit-card-refund.use-case';
import { CreateCreditCardUseCase } from './application/use-cases/create-credit-card.use-case';
import { DeleteCreditCardPurchaseUseCase } from './application/use-cases/delete-credit-card-purchase.use-case';
import { DeleteCreditCardRefundUseCase } from './application/use-cases/delete-credit-card-refund.use-case';
import { DeleteCreditCardUseCase } from './application/use-cases/delete-credit-card.use-case';
import { GetCreditCardInvoiceUseCase } from './application/use-cases/get-credit-card-invoice.use-case';
import { GetCreditCardPurchaseUseCase } from './application/use-cases/get-credit-card-purchase.use-case';
import { GetCreditCardUseCase } from './application/use-cases/get-credit-card.use-case';
import { ListCreditCardInvoicesUseCase } from './application/use-cases/list-credit-card-invoices.use-case';
import { ListCreditCardPurchasesUseCase } from './application/use-cases/list-credit-card-purchases.use-case';
import { ListCreditCardsUseCase } from './application/use-cases/list-credit-cards.use-case';
import { PayCreditCardInvoiceUseCase } from './application/use-cases/pay-credit-card-invoice.use-case';
import { UpdateCreditCardPurchaseUseCase } from './application/use-cases/update-credit-card-purchase.use-case';
import { UpdateCreditCardStatusUseCase } from './application/use-cases/update-credit-card-status.use-case';
import { UpdateCreditCardUseCase } from './application/use-cases/update-credit-card.use-case';
import { CREDIT_CARD_INVOICE_REPOSITORY } from './domain/repositories/credit-card-invoice.repository';
import { CREDIT_CARD_PAYMENT_REPOSITORY } from './domain/repositories/credit-card-payment.repository';
import { CREDIT_CARD_PURCHASE_REPOSITORY } from './domain/repositories/credit-card-purchase.repository';
import { CREDIT_CARD_REFUND_REPOSITORY } from './domain/repositories/credit-card-refund.repository';
import { CREDIT_CARD_REPOSITORY } from './domain/repositories/credit-card.repository';
import { CreditCardInstallmentOrmEntity } from './infrastructure/persistence/entities/credit-card-installment.orm-entity';
import { CreditCardInvoiceOrmEntity } from './infrastructure/persistence/entities/credit-card-invoice.orm-entity';
import { CreditCardPaymentOrmEntity } from './infrastructure/persistence/entities/credit-card-payment.orm-entity';
import { CreditCardPurchaseOrmEntity } from './infrastructure/persistence/entities/credit-card-purchase.orm-entity';
import { CreditCardRefundOrmEntity } from './infrastructure/persistence/entities/credit-card-refund.orm-entity';
import { CreditCardOrmEntity } from './infrastructure/persistence/entities/credit-card.orm-entity';
import { TypeOrmCreditCardInvoiceRepository } from './infrastructure/persistence/repositories/typeorm-credit-card-invoice.repository';
import { TypeOrmCreditCardPaymentRepository } from './infrastructure/persistence/repositories/typeorm-credit-card-payment.repository';
import { TypeOrmCreditCardPurchaseRepository } from './infrastructure/persistence/repositories/typeorm-credit-card-purchase.repository';
import { TypeOrmCreditCardRefundRepository } from './infrastructure/persistence/repositories/typeorm-credit-card-refund.repository';
import { TypeOrmCreditCardRepository } from './infrastructure/persistence/repositories/typeorm-credit-card.repository';
import { CreditCardInvoicesController } from './presentation/controllers/credit-card-invoices.controller';
import { CreditCardPurchasesController } from './presentation/controllers/credit-card-purchases.controller';
import { CreditCardsController } from './presentation/controllers/credit-cards.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CreditCardOrmEntity,
      CreditCardInvoiceOrmEntity,
      CreditCardPurchaseOrmEntity,
      CreditCardInstallmentOrmEntity,
      CreditCardRefundOrmEntity,
      CreditCardPaymentOrmEntity,
    ]),
    AccountsModule,
    TransactionCategoriesModule,
  ],
  controllers: [
    CreditCardsController,
    CreditCardInvoicesController,
    CreditCardPurchasesController,
  ],
  providers: [
    { provide: CREDIT_CARD_REPOSITORY, useClass: TypeOrmCreditCardRepository },
    {
      provide: CREDIT_CARD_INVOICE_REPOSITORY,
      useClass: TypeOrmCreditCardInvoiceRepository,
    },
    {
      provide: CREDIT_CARD_PURCHASE_REPOSITORY,
      useClass: TypeOrmCreditCardPurchaseRepository,
    },
    {
      provide: CREDIT_CARD_REFUND_REPOSITORY,
      useClass: TypeOrmCreditCardRefundRepository,
    },
    {
      provide: CREDIT_CARD_PAYMENT_REPOSITORY,
      useClass: TypeOrmCreditCardPaymentRepository,
    },
    CreditCardInvoiceAssigner,
    CreditCardStatements,
    CreditCardPaymentLedger,
    ListCreditCardsUseCase,
    GetCreditCardUseCase,
    ListCreditCardInvoicesUseCase,
    CreateCreditCardUseCase,
    UpdateCreditCardUseCase,
    UpdateCreditCardStatusUseCase,
    DeleteCreditCardUseCase,
    GetCreditCardInvoiceUseCase,
    PayCreditCardInvoiceUseCase,
    CancelCreditCardPaymentUseCase,
    ListCreditCardPurchasesUseCase,
    GetCreditCardPurchaseUseCase,
    CreateCreditCardPurchaseUseCase,
    CreateCreditCardRefundUseCase,
    UpdateCreditCardPurchaseUseCase,
    DeleteCreditCardPurchaseUseCase,
    DeleteCreditCardRefundUseCase,
  ],
  exports: [
    CREDIT_CARD_REPOSITORY,
    CREDIT_CARD_PURCHASE_REPOSITORY,
    CreditCardStatements,
    CreditCardInvoiceAssigner,
    CreateCreditCardPurchaseUseCase,
  ],
})
export class CreditCardsModule {}
