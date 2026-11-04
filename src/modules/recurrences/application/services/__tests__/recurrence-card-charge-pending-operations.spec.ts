import type { CreditCardPendingOperationsRegistry } from '@modules/credit-cards';
import { TransactionState } from '@modules/transactions';
import { buildRecurrenceCardCharge } from '@test/support/builders/recurrence.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import type { RecurrenceCardChargeEntity } from '../../../domain/entities/recurrence-card-charge.entity';
import type { RecurrenceCardChargeRepository } from '../../../domain/repositories/recurrence-card-charge.repository';
import { RecurrenceCardChargePendingOperations } from '../recurrence-card-charge-pending-operations';

describe('RecurrenceCardChargePendingOperations', () => {
  function setup() {
    const charges = {
      findPlannedByCard: jest
        .fn()
        .mockResolvedValue([
          buildRecurrenceCardCharge({ id: 1, amount: 5590 }),
          buildRecurrenceCardCharge({ id: 2, amount: 2190 }),
        ]),
      update: jest.fn((charge: RecurrenceCardChargeEntity) =>
        Promise.resolve(charge),
      ),
    };

    const register = jest.fn();

    return {
      charges,
      register,
      source: new RecurrenceCardChargePendingOperations(
        mockOf<RecurrenceCardChargeRepository>(charges),
        mockOf<CreditCardPendingOperationsRegistry>({ register }),
      ),
    };
  }

  it('registers itself with the credit card module', () => {
    const { source, register } = setup();

    source.onModuleInit();

    expect(register).toHaveBeenCalledWith(source);
  });

  it('summarizes the planned charges of the card', async () => {
    const { source, charges } = setup();

    await expect(source.summarize(1, 4)).resolves.toEqual({
      count: 2,
      total: 7780,
    });
    expect(charges.findPlannedByCard).toHaveBeenCalledWith(1, 4);
  });

  it('cancels each planned charge without deleting it', async () => {
    const { source, charges } = setup();

    await source.cancel(1, 4);

    expect(charges.update.mock.calls.map(([charge]) => charge)).toEqual([
      expect.objectContaining({
        id: 1,
        state: TransactionState.CANCELED,
        canceledAt: expect.any(Date) as Date,
        deletedAt: null,
      }),
      expect.objectContaining({
        id: 2,
        state: TransactionState.CANCELED,
        canceledAt: expect.any(Date) as Date,
        deletedAt: null,
      }),
    ]);
  });
});
