import { Inject, Injectable } from '@nestjs/common';
import {
  ACCOUNT_REPOSITORY,
  InactiveAccountError,
  findOwnedAccount,
  type AccountEntity,
  type AccountRepository,
} from '@modules/accounts';
import {
  CREDIT_CARD_REPOSITORY,
  InactiveCreditCardError,
  findOwnedCreditCard,
  type CreditCardEntity,
  type CreditCardRepository,
} from '@modules/credit-cards';
import {
  InactiveTransactionCategoryError,
  TRANSACTION_CATEGORY_REPOSITORY,
  findVisibleTransactionCategory,
  type TransactionCategoryEntity,
  type TransactionCategoryRepository,
} from '@modules/transaction-categories';
import { assertRecordActive } from '@shared/domain/policies';
import type { RecurrenceEntity } from '../../domain/entities/recurrence.entity';
import { RecurrenceNotFoundError } from '../../domain/errors/recurrence-not-found.error';
import {
  RECURRENCE_REPOSITORY,
  type RecurrenceRepository,
} from '../../domain/repositories/recurrence.repository';

@Injectable()
export class RecurrenceReferences {
  constructor(
    @Inject(RECURRENCE_REPOSITORY)
    private readonly recurrenceRepository: RecurrenceRepository,
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: AccountRepository,
    @Inject(CREDIT_CARD_REPOSITORY)
    private readonly cardRepository: CreditCardRepository,
    @Inject(TRANSACTION_CATEGORY_REPOSITORY)
    private readonly categoryRepository: TransactionCategoryRepository,
  ) {}

  async lockOwnerFinances(ownerId: number): Promise<void> {
    await this.accountRepository.lockOwnerAccounts(ownerId);
    await this.cardRepository.lockOwnerCards(ownerId);
  }

  async findRecurrence(
    uuid: string,
    ownerId: number,
  ): Promise<RecurrenceEntity> {
    return this.orNotFound(
      await this.recurrenceRepository.findByUuidForOwner(uuid, ownerId),
    );
  }

  async lockRecurrence(
    uuid: string,
    ownerId: number,
  ): Promise<RecurrenceEntity> {
    return this.orNotFound(
      await this.recurrenceRepository.findByUuidForOwnerForUpdate(
        uuid,
        ownerId,
      ),
    );
  }

  async activeAccount(uuid: string, ownerId: number): Promise<AccountEntity> {
    const account = await findOwnedAccount(
      this.accountRepository,
      uuid,
      ownerId,
    );

    assertRecordActive(account, new InactiveAccountError());

    return account;
  }

  async activeCard(uuid: string, ownerId: number): Promise<CreditCardEntity> {
    const card = await findOwnedCreditCard(this.cardRepository, uuid, ownerId);

    assertRecordActive(card, new InactiveCreditCardError());

    return card;
  }

  async activeCategory(
    uuid: string,
    ownerId: number,
  ): Promise<TransactionCategoryEntity> {
    const category = await findVisibleTransactionCategory(
      this.categoryRepository,
      uuid,
      ownerId,
    );

    assertRecordActive(category, new InactiveTransactionCategoryError());

    return category;
  }

  private orNotFound(recurrence: RecurrenceEntity | null): RecurrenceEntity {
    if (!recurrence) {
      throw new RecurrenceNotFoundError();
    }

    return recurrence;
  }
}
