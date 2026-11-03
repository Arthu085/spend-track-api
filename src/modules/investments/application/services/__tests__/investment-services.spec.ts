import type { AccountLedgerRegistry } from '@modules/accounts';
import { TransactionState } from '@modules/transactions';
import { buildInvestment } from '@test/support/builders/investment.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import { InvestmentInsufficientValueError } from '../../../domain/errors/investment-insufficient-value.error';
import type { InvestmentMovementRepository } from '../../../domain/repositories/investment-movement.repository';
import { InvestmentMovementLedger } from '../investment-movement-ledger';
import { InvestmentValues } from '../investment-values';

describe('InvestmentValues', () => {
  const totals = new Map([
    [1, { contributed: 100000, withdrawn: 20000, adjusted: 500 }],
  ]);

  function setup() {
    const sumTotalsByInvestment = jest.fn().mockResolvedValue(totals);

    return {
      values: new InvestmentValues(
        mockOf<InvestmentMovementRepository>({ sumTotalsByInvestment }),
      ),
      sumTotalsByInvestment,
    };
  }

  it("values each investment from its owner's completed movements, zero without any", async () => {
    const { values, sumTotalsByInvestment } = setup();

    const result = await values.withValues([
      buildInvestment({ id: 1, ownerId: 7 }),
      buildInvestment({ id: 2, ownerId: 7 }),
    ]);

    expect(sumTotalsByInvestment).toHaveBeenCalledWith(7, [1, 2]);
    expect(result.map(({ value }) => value.current)).toEqual([80500, 0]);
  });

  it('queries nothing for an empty list', async () => {
    const { values, sumTotalsByInvestment } = setup();

    await expect(values.withValues([])).resolves.toEqual([]);
    expect(sumTotalsByInvestment).not.toHaveBeenCalled();
  });

  it('rejects a change that would leave a negative value', async () => {
    const { values } = setup();
    const investment = buildInvestment({ id: 1 });

    await expect(
      values.assertCanChangeBy(investment, -80500),
    ).resolves.toBeUndefined();
    await expect(
      values.assertCanChangeBy(investment, 1),
    ).resolves.toBeUndefined();
    await expect(values.assertCanChangeBy(investment, -80501)).rejects.toThrow(
      InvestmentInsufficientValueError,
    );
  });
});

describe('InvestmentMovementLedger', () => {
  it('registers itself and reports completed movements per account', async () => {
    const register = jest.fn();
    const changes = new Map([[3, -5000]]);

    const sumAccountChanges = jest.fn().mockResolvedValue(changes);

    const repository = mockOf<InvestmentMovementRepository>({
      sumAccountChanges,
      existsForAccount: jest.fn().mockResolvedValue(true),
    });

    const ledger = new InvestmentMovementLedger(
      repository,
      mockOf<AccountLedgerRegistry>({ register }),
    );

    ledger.onModuleInit();

    expect(register).toHaveBeenCalledWith(ledger);
    await expect(ledger.balanceChanges(4, [3])).resolves.toBe(changes);
    expect(sumAccountChanges).toHaveBeenCalledWith(4, [3], {
      state: TransactionState.COMPLETED,
    });
    await expect(ledger.hasEntries(4, 3)).resolves.toBe(true);
  });
});
