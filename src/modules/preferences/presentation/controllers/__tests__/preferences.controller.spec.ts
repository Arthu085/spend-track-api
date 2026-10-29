import type { Translate } from '@shared/presentation/decorators';
import type { AuthenticatedUser } from '@shared/presentation/http';
import { mockOf } from '@test/support/mocks/mock-of';
import type { GetPreferencesUseCase } from '../../../application/use-cases/get-preferences.use-case';
import type { UpdatePreferencesUseCase } from '../../../application/use-cases/update-preferences.use-case';
import { DefaultMonth } from '../../../domain/enums/default-month.enum';
import { SpendingPerspective } from '../../../domain/enums/spending-perspective.enum';
import { PreferencesController } from '../preferences.controller';

const translate: Translate = (key) => `t:${key}`;

const actor: AuthenticatedUser = {
  id: 11,
  uuid: 'actor-uuid',
  email: 'actor@example.com',
  name: 'Actor',
  roles: ['ADMIN'],
};

const preferences = {
  spendingPerspective: SpendingPerspective.INVOICE_MONTH,
  defaultMonth: DefaultMonth.NEXT,
  updatedAt: null,
};

describe('PreferencesController', () => {
  it("reads the caller's preferences with localized labels", async () => {
    const execute = jest.fn().mockResolvedValue(preferences);

    const controller = new PreferencesController(
      mockOf<GetPreferencesUseCase>({ execute }),
      mockOf<UpdatePreferencesUseCase>(),
    );

    const result = await controller.findMine(actor, translate);

    expect(execute).toHaveBeenCalledWith(11);
    expect(result).toEqual({
      spendingPerspective: SpendingPerspective.INVOICE_MONTH,
      spendingPerspectiveLabel:
        't:preferences.spending_perspective.invoice_month',
      defaultMonth: DefaultMonth.NEXT,
      defaultMonthLabel: 't:preferences.default_month.next',
      updatedAt: null,
    });
  });

  it('updates the preferences of the caller only', async () => {
    const execute = jest.fn().mockResolvedValue(preferences);

    const controller = new PreferencesController(
      mockOf<GetPreferencesUseCase>(),
      mockOf<UpdatePreferencesUseCase>({ execute }),
    );

    await controller.updateMine(
      { defaultMonth: DefaultMonth.NEXT },
      actor,
      translate,
    );

    expect(execute).toHaveBeenCalledWith({
      userId: 11,
      spendingPerspective: undefined,
      defaultMonth: DefaultMonth.NEXT,
    });
  });
});
