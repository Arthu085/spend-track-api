import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import { AccountOrmEntity } from '@modules/accounts/infrastructure/persistence/entities/account.orm-entity';
import { CreditCardEntity } from '@modules/credit-cards/domain/entities/credit-card.entity';
import { CreditCardInstallmentOrmEntity } from '@modules/credit-cards/infrastructure/persistence/entities/credit-card-installment.orm-entity';
import { CreditCardInvoiceOrmEntity } from '@modules/credit-cards/infrastructure/persistence/entities/credit-card-invoice.orm-entity';
import { CreditCardPurchaseOrmEntity } from '@modules/credit-cards/infrastructure/persistence/entities/credit-card-purchase.orm-entity';
import { CreditCardOrmEntity } from '@modules/credit-cards/infrastructure/persistence/entities/credit-card.orm-entity';
import { TypeOrmCreditCardRepository } from '@modules/credit-cards/infrastructure/persistence/repositories/typeorm-credit-card.repository';
import { TransactionCategoryEntity } from '@modules/transaction-categories/domain/entities/transaction-category.entity';
import { TransactionCategoryKind } from '@modules/transaction-categories/domain/enums/transaction-category-kind.enum';
import { TransactionCategoryOrmEntity } from '@modules/transaction-categories/infrastructure/persistence/entities/transaction-category.orm-entity';
import { TypeOrmTransactionCategoryRepository } from '@modules/transaction-categories/infrastructure/persistence/repositories/typeorm-transaction-category.repository';
import { TransactionState } from '@modules/transactions';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';
import { RecurrenceCardChargeEntity } from '../../../../domain/entities/recurrence-card-charge.entity';
import { RecurrenceEntity } from '../../../../domain/entities/recurrence.entity';
import { RecurrenceFrequency } from '../../../../domain/enums/recurrence-frequency.enum';
import { RecurrenceType } from '../../../../domain/enums/recurrence-type.enum';
import { RecurrenceCardChargeOrmEntity } from '../../entities/recurrence-card-charge.orm-entity';
import { RecurrenceOrmEntity } from '../../entities/recurrence.orm-entity';
import { TypeOrmRecurrenceCardChargeRepository } from '../typeorm-recurrence-card-charge.repository';
import { TypeOrmRecurrenceRepository } from '../typeorm-recurrence.repository';

describe('recurrence card charge repository (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let charges: TypeOrmRecurrenceCardChargeRepository;
  let recurrences: TypeOrmRecurrenceRepository;
  let cards: TypeOrmCreditCardRepository;
  let categories: TypeOrmTransactionCategoryRepository;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        CoreConfigModule,
        DatabaseModule,
        TypeOrmModule.forFeature([
          RecurrenceOrmEntity,
          RecurrenceCardChargeOrmEntity,
          CreditCardOrmEntity,
          CreditCardInvoiceOrmEntity,
          CreditCardPurchaseOrmEntity,
          CreditCardInstallmentOrmEntity,
          AccountOrmEntity,
          TransactionCategoryOrmEntity,
          UserOrmEntity,
        ]),
      ],
      providers: [
        TypeOrmRecurrenceCardChargeRepository,
        TypeOrmRecurrenceRepository,
        TypeOrmCreditCardRepository,
        TypeOrmTransactionCategoryRepository,
      ],
    }).compile();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
    charges = moduleRef.get(TypeOrmRecurrenceCardChargeRepository);
    recurrences = moduleRef.get(TypeOrmRecurrenceRepository);
    cards = moduleRef.get(TypeOrmCreditCardRepository);
    categories = moduleRef.get(TypeOrmTransactionCategoryRepository);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "recurrence_card_charges", "recurrences", "credit_cards", "transaction_categories", "users" RESTART IDENTITY CASCADE',
    );
  });

  async function insertUser(): Promise<number> {
    const users = dataSource.getRepository(UserOrmEntity);

    const user = await users.save(
      users.create({
        name: 'Owner',
        email: `${randomUUID()}@example.com`,
        password: 'hash',
      }),
    );

    return user.id;
  }

  function createCard(ownerId: number, name: string) {
    return cards.create(
      CreditCardEntity.create({
        uuid: randomUUID(),
        ownerId,
        name,
        creditLimit: 100000,
        closingDay: 5,
        dueDay: 12,
        isDefault: false,
      }),
    );
  }

  function createCategory(ownerId: number) {
    return categories.create(
      TransactionCategoryEntity.createPersonal({
        uuid: randomUUID(),
        ownerId,
        name: 'Streaming',
        color: null,
        kind: TransactionCategoryKind.EXPENSE,
      }),
    );
  }

  function createRecurrence(
    card: CreditCardEntity,
    category: TransactionCategoryEntity,
    schedule: { startDate: string; endDate: string | null } = {
      startDate: '2026-11-15',
      endDate: null,
    },
  ) {
    return recurrences.create(
      RecurrenceEntity.create({
        uuid: randomUUID(),
        ownerId: card.ownerId,
        type: RecurrenceType.EXPENSE,
        description: 'Netflix',
        amount: 5590,
        frequency: RecurrenceFrequency.MONTHLY,
        ...schedule,
        account: null,
        creditCard: card,
        category,
        notes: null,
      }),
    );
  }

  function createCharge(
    recurrence: RecurrenceEntity,
    category: TransactionCategoryEntity,
    occurrenceDate: string,
  ) {
    return charges.create(
      RecurrenceCardChargeEntity.create({
        uuid: randomUUID(),
        ownerId: recurrence.ownerId,
        recurrenceId: recurrence.id,
        occurrenceDate,
        description: 'Netflix',
        amount: 5590,
        category,
        invoiceMonth: `${occurrenceDate.slice(0, 7)}-01`,
      }),
    );
  }

  it('leaves a recurrence past its end date out of generation, keeping one ending today', async () => {
    const ownerId = await insertUser();
    const category = await createCategory(ownerId);
    const visa = await createCard(ownerId, 'Visa');
    const startDate = '2026-08-15';

    await createRecurrence(visa, category, {
      startDate,
      endDate: '2026-11-03',
    });

    const endsToday = await createRecurrence(visa, category, {
      startDate,
      endDate: '2026-11-04',
    });

    const openEnded = await createRecurrence(visa, category, {
      startDate,
      endDate: null,
    });

    const due = await recurrences.findDueForGeneration(
      '2027-11-30',
      '2026-11-04',
      10,
    );

    expect(due.map(({ uuid }) => uuid)).toEqual([
      endsToday.uuid,
      openEnded.uuid,
    ]);
  });

  it('finds the planned charges of every recurrence of the card, oldest first', async () => {
    const ownerId = await insertUser();
    const category = await createCategory(ownerId);
    const visa = await createCard(ownerId, 'Visa');
    const master = await createCard(ownerId, 'Master');
    const netflix = await createRecurrence(visa, category);
    const music = await createRecurrence(visa, category);
    const other = await createRecurrence(master, category);

    const later = await createCharge(netflix, category, '2026-12-15');
    const earlier = await createCharge(music, category, '2026-11-20');

    await charges.update(
      (await createCharge(netflix, category, '2026-11-15')).cancel(),
    );
    await charges.softDelete(
      await createCharge(netflix, category, '2027-01-15'),
    );
    await createCharge(other, category, '2026-11-10');

    const planned = await charges.findPlannedByCard(ownerId, visa.id);

    expect(planned.map(({ uuid }) => uuid)).toEqual([earlier.uuid, later.uuid]);
    expect(planned[0]).toMatchObject({
      state: TransactionState.PLANNED,
      category: { id: category.id },
    });
  });

  it('never finds the charges of another owner', async () => {
    const ownerId = await insertUser();
    const category = await createCategory(ownerId);
    const visa = await createCard(ownerId, 'Visa');
    const recurrence = await createRecurrence(visa, category);

    await createCharge(recurrence, category, '2026-11-15');

    await expect(
      charges.findPlannedByCard(await insertUser(), visa.id),
    ).resolves.toEqual([]);
  });

  it('keeps a canceled charge readable as history', async () => {
    const ownerId = await insertUser();
    const category = await createCategory(ownerId);
    const visa = await createCard(ownerId, 'Visa');
    const recurrence = await createRecurrence(visa, category);

    const charge = await createCharge(recurrence, category, '2026-11-15');

    await charges.update(charge.cancel());

    await expect(
      charges.findByUuidForRecurrence(charge.uuid, recurrence.id),
    ).resolves.toMatchObject({
      state: TransactionState.CANCELED,
      canceledAt: expect.any(Date) as Date,
      deletedAt: null,
    });
    await expect(charges.findPlannedByCard(ownerId, visa.id)).resolves.toEqual(
      [],
    );
  });
});
