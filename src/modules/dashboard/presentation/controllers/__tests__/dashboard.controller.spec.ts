import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SpendingPerspective } from '@modules/preferences';
import type { Translate } from '@shared/presentation/decorators';
import type { AuthenticatedUser } from '@shared/presentation/http';
import { buildAccount } from '@test/support/builders/account.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import type { GetDashboardUseCase } from '../../../application/use-cases/get-dashboard.use-case';
import {
  PeriodTiming,
  resolveMonthPeriod,
} from '../../../domain/period/month-period';
import { DashboardQueryDto } from '../../dto/input/dashboard-query.dto';
import { DashboardController } from '../dashboard.controller';

const translate: Translate = (key) => `t:${key}`;

const actor: AuthenticatedUser = {
  id: 41,
  uuid: 'actor-uuid',
  email: 'actor@example.com',
  name: 'Actor',
  roles: ['ADMIN'],
};

describe('DashboardController', () => {
  it("serializes the caller's summary with decimal amounts", async () => {
    const execute = jest.fn().mockResolvedValue({
      period: resolveMonthPeriod({ year: 2026, month: 11 }, '2026-10-29'),
      perspective: SpendingPerspective.INVOICE_MONTH,
      balances: { actual: -5, projected: 100000 },
      accounts: [
        {
          account: buildAccount({ isDefault: true }),
          actualBalance: -5,
          projectedBalance: 100000,
        },
      ],
    });

    const controller = new DashboardController(
      mockOf<GetDashboardUseCase>({ execute }),
    );

    const result = await controller.findMine(
      { year: 2026, month: 11 },
      actor,
      translate,
    );

    expect(execute).toHaveBeenCalledWith({
      ownerId: 41,
      year: 2026,
      month: 11,
      perspective: undefined,
    });
    expect(result.period).toMatchObject({
      timing: PeriodTiming.FUTURE,
      remainingDays: 30,
    });
    expect(result.perspectiveLabel).toBe(
      't:preferences.spending_perspective.invoice_month',
    );
    expect(result.balances).toEqual({ actual: '-0.05', projected: '1000.00' });
    expect(result.accounts[0]).toMatchObject({
      isDefault: true,
      typeLabel: 't:accounts.type.checking',
      actualBalance: '-0.05',
      projectedBalance: '1000.00',
    });
  });
});

describe('DashboardQueryDto', () => {
  async function errorsFor(query: Record<string, unknown>) {
    return validate(plainToInstance(DashboardQueryDto, query));
  }

  it('accepts no month at all', async () => {
    await expect(errorsFor({})).resolves.toHaveLength(0);
  });

  it('accepts a year and month sent together as query strings', async () => {
    await expect(
      errorsFor({ year: '2026', month: '12' }),
    ).resolves.toHaveLength(0);
  });

  it.each([[{ year: '2026' }], [{ month: '3' }]])(
    'requires year and month together: %o',
    async (query) => {
      await expect(errorsFor(query)).resolves.toHaveLength(1);
    },
  );

  it('rejects a month outside 1–12', async () => {
    const errors = await errorsFor({ year: '2026', month: '13' });

    expect(errors[0].constraints).toHaveProperty('max');
  });
});
