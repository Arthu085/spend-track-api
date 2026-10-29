import { mockOf } from '@test/support/mocks/mock-of';
import { DefaultMonth } from '../../../domain/enums/default-month.enum';
import { SpendingPerspective } from '../../../domain/enums/spending-perspective.enum';
import type { UserPreferencesRepository } from '../../../domain/repositories/user-preferences.repository';
import { UpdatePreferencesUseCase } from '../update-preferences.use-case';

describe('UpdatePreferencesUseCase', () => {
  function build(
    stored: Awaited<ReturnType<UserPreferencesRepository['findByUserId']>>,
  ) {
    const save = jest.fn(
      (
        _userId: number,
        values: Parameters<UserPreferencesRepository['save']>[1],
      ) => Promise.resolve({ ...values, updatedAt: new Date() }),
    );

    const useCase = new UpdatePreferencesUseCase(
      mockOf<UserPreferencesRepository>({
        findByUserId: jest.fn().mockResolvedValue(stored),
        save,
      }),
    );

    return { useCase, save };
  }

  it('starts from the defaults when nothing is stored and applies the sent fields', async () => {
    const { useCase, save } = build(null);

    await useCase.execute({
      userId: 3,
      spendingPerspective: SpendingPerspective.INVOICE_MONTH,
    });

    expect(save).toHaveBeenCalledWith(3, {
      spendingPerspective: SpendingPerspective.INVOICE_MONTH,
      defaultMonth: DefaultMonth.CURRENT,
    });
  });

  it('keeps the stored value of every omitted field', async () => {
    const { useCase, save } = build({
      spendingPerspective: SpendingPerspective.INVOICE_MONTH,
      defaultMonth: DefaultMonth.CURRENT,
      updatedAt: new Date(),
    });

    await useCase.execute({ userId: 3, defaultMonth: DefaultMonth.NEXT });

    expect(save).toHaveBeenCalledWith(3, {
      spendingPerspective: SpendingPerspective.INVOICE_MONTH,
      defaultMonth: DefaultMonth.NEXT,
    });
  });
});
