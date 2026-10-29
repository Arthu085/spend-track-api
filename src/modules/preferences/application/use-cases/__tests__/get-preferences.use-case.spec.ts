import { mockOf } from '@test/support/mocks/mock-of';
import { DefaultMonth } from '../../../domain/enums/default-month.enum';
import { SpendingPerspective } from '../../../domain/enums/spending-perspective.enum';
import type { UserPreferencesRepository } from '../../../domain/repositories/user-preferences.repository';
import { GetPreferencesUseCase } from '../get-preferences.use-case';

describe('GetPreferencesUseCase', () => {
  it("reads the caller's own preferences", async () => {
    const stored = {
      spendingPerspective: SpendingPerspective.INVOICE_MONTH,
      defaultMonth: DefaultMonth.NEXT,
      updatedAt: new Date(),
    };

    const findByUserId = jest.fn().mockResolvedValue(stored);

    const useCase = new GetPreferencesUseCase(
      mockOf<UserPreferencesRepository>({ findByUserId }),
    );

    await expect(useCase.execute(7)).resolves.toBe(stored);
    expect(findByUserId).toHaveBeenCalledWith(7);
  });

  it('returns the defaults when the user never saved preferences', async () => {
    const useCase = new GetPreferencesUseCase(
      mockOf<UserPreferencesRepository>({
        findByUserId: jest.fn().mockResolvedValue(null),
      }),
    );

    await expect(useCase.execute(7)).resolves.toEqual({
      spendingPerspective: SpendingPerspective.PURCHASE_DATE,
      defaultMonth: DefaultMonth.CURRENT,
      updatedAt: null,
    });
  });
});
