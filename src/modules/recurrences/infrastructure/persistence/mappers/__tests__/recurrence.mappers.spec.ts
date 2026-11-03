import { CreditCardOrmEntity } from '@modules/credit-cards/infrastructure/persistence/entities/credit-card.orm-entity';
import { CreditCardPurchaseOrmEntity } from '@modules/credit-cards/infrastructure/persistence/entities/credit-card-purchase.orm-entity';
import { TransactionCategoryKind } from '@modules/transaction-categories';
import { TransactionCategoryOrmEntity } from '@modules/transaction-categories/infrastructure/persistence/entities/transaction-category.orm-entity';
import { TransactionState } from '@modules/transactions';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { buildCreditCard } from '@test/support/builders/credit-card.builder';
import {
  buildRecurrence,
  buildRecurrenceCardCharge,
} from '@test/support/builders/recurrence.builder';
import { RecurrenceFrequency } from '../../../../domain/enums/recurrence-frequency.enum';
import { RecurrenceState } from '../../../../domain/enums/recurrence-state.enum';
import { RecurrenceType } from '../../../../domain/enums/recurrence-type.enum';
import { RecurrenceCardChargeOrmEntity } from '../../entities/recurrence-card-charge.orm-entity';
import { RecurrenceOrmEntity } from '../../entities/recurrence.orm-entity';
import { RecurrenceCardChargeMapper } from '../recurrence-card-charge.mapper';
import { RecurrenceMapper } from '../recurrence.mapper';

const created = new Date('2026-10-01T00:00:00Z');

const categoryRow = Object.assign(new TransactionCategoryOrmEntity(), {
  id: 3,
  uuid: 'category-uuid',
  status: RecordStatus.ACTIVE,
  userId: 9,
  code: null,
  name: 'Streaming',
  kind: TransactionCategoryKind.EXPENSE,
  color: null,
  createdAt: created,
  updatedAt: created,
  deletedAt: null,
});

describe('RecurrenceMapper', () => {
  it('maps a card recurrence row with its relations and amount in cents', () => {
    const row = Object.assign(new RecurrenceOrmEntity(), {
      id: 4,
      uuid: 'recurrence-uuid',
      status: RecordStatus.ACTIVE,
      userId: 9,
      type: RecurrenceType.EXPENSE,
      description: 'Netflix',
      amount: '55.90',
      frequency: RecurrenceFrequency.MONTHLY,
      startDate: '2026-11-15',
      endDate: null,
      state: RecurrenceState.ACTIVE,
      accountId: null,
      account: null,
      creditCardId: 2,
      creditCard: Object.assign(new CreditCardOrmEntity(), {
        id: 2,
        uuid: 'card-uuid',
        status: RecordStatus.ACTIVE,
        userId: 9,
        name: 'Visa',
        creditLimit: '5000.00',
        closingDay: 5,
        dueDay: 12,
        isDefault: false,
        createdAt: created,
        updatedAt: created,
        deletedAt: null,
      }),
      categoryId: 3,
      category: categoryRow,
      notes: null,
      generatedThrough: '2027-11-30',
      createdAt: created,
      updatedAt: created,
      deletedAt: null,
    });

    const recurrence = RecurrenceMapper.toDomain(row);

    expect(recurrence).toMatchObject({
      amount: 5590,
      account: null,
      creditCard: { uuid: 'card-uuid' },
      category: { uuid: 'category-uuid' },
      generatedThrough: '2027-11-30',
    });
    expect(() =>
      RecurrenceMapper.toDomain(
        Object.assign(new RecurrenceOrmEntity(), row, { category: undefined }),
      ),
    ).toThrow('Recurrence category relation must be loaded');
  });

  it('maps a recurrence to a row with foreign keys', () => {
    const fresh = RecurrenceMapper.toOrm(buildRecurrence({ id: 0 }));

    const stored = RecurrenceMapper.toOrm(
      buildRecurrence({ id: 7, account: null, creditCard: buildCreditCard() }),
    );

    expect(fresh.id).toBeUndefined();
    expect(fresh).toMatchObject({
      amount: '1500.00',
      accountId: 1,
      creditCardId: null,
      categoryId: 1,
    });
    expect(stored).toMatchObject({ id: 7, accountId: null, creditCardId: 1 });
  });
});

describe('RecurrenceCardChargeMapper', () => {
  const row = (overrides: Partial<RecurrenceCardChargeOrmEntity> = {}) =>
    Object.assign(new RecurrenceCardChargeOrmEntity(), {
      id: 5,
      uuid: 'charge-uuid',
      status: RecordStatus.ACTIVE,
      userId: 9,
      recurrenceId: 4,
      occurrenceDate: '2026-11-15',
      date: '2026-11-16',
      description: 'Netflix',
      amount: '59.90',
      categoryId: 3,
      category: categoryRow,
      invoiceMonth: '2026-12-01',
      state: TransactionState.COMPLETED,
      canceledAt: null,
      creditCardPurchaseId: 8,
      creditCardPurchase: Object.assign(new CreditCardPurchaseOrmEntity(), {
        uuid: 'purchase-uuid',
      }),
      createdAt: created,
      updatedAt: created,
      deletedAt: null,
      ...overrides,
    });

  it('maps a confirmed charge with its purchase', () => {
    expect(RecurrenceCardChargeMapper.toDomain(row())).toMatchObject({
      amount: 5990,
      occurrenceDate: '2026-11-15',
      purchase: { id: 8, uuid: 'purchase-uuid' },
    });
    expect(
      RecurrenceCardChargeMapper.toDomain(
        row({
          state: TransactionState.PLANNED,
          creditCardPurchaseId: null,
          creditCardPurchase: null,
        }),
      ).purchase,
    ).toBeNull();
  });

  it('refuses rows loaded without their relations', () => {
    expect(() =>
      RecurrenceCardChargeMapper.toDomain(row({ category: undefined })),
    ).toThrow('Card charge category relation must be loaded');
    expect(() =>
      RecurrenceCardChargeMapper.toDomain(row({ creditCardPurchase: null })),
    ).toThrow('Card charge purchase relation must be loaded');
  });

  it('maps a charge to a row', () => {
    const fresh = RecurrenceCardChargeMapper.toOrm(
      buildRecurrenceCardCharge({ id: 0 }),
    );

    const confirmed = RecurrenceCardChargeMapper.toOrm(
      buildRecurrenceCardCharge({
        id: 5,
        state: TransactionState.COMPLETED,
        purchase: { id: 8, uuid: 'purchase-uuid' },
      }),
    );

    expect(fresh.id).toBeUndefined();
    expect(fresh).toMatchObject({
      amount: '55.90',
      creditCardPurchaseId: null,
    });
    expect(confirmed).toMatchObject({ id: 5, creditCardPurchaseId: 8 });
  });
});
