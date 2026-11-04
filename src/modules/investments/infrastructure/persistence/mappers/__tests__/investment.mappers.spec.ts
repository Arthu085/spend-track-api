import {
  buildInvestment,
  buildInvestmentMovement,
} from '@test/support/builders/investment.builder';
import { InvestmentMovementType } from '../../../../domain/enums/investment-movement-type.enum';
import { InvestmentMovementOrmEntity } from '../../entities/investment-movement.orm-entity';
import { InvestmentMovementMapper } from '../investment-movement.mapper';
import { InvestmentMapper } from '../investment.mapper';

describe('Investment mappers', () => {
  it('round-trips an investment with and without a target', () => {
    for (const investment of [
      buildInvestment({ id: 4, targetAmount: 123456 }),
      buildInvestment({ id: 4, targetAmount: null }),
    ]) {
      const orm = InvestmentMapper.toOrm(investment);

      expect(orm.targetAmount).toBe(
        investment.targetAmount === null ? null : '1234.56',
      );
      expect(InvestmentMapper.toDomain(orm)).toMatchObject({
        id: 4,
        targetAmount: investment.targetAmount,
      });
    }
  });

  it('leaves the id and updatedAt unset for a new investment', () => {
    const orm = InvestmentMapper.toOrm(buildInvestment({ id: 0 }));

    expect(orm.id).toBeUndefined();
    expect(orm.updatedAt).toBeUndefined();
  });

  it('maps a valuation without an account and a signed amount', () => {
    const orm = InvestmentMovementMapper.toOrm(
      buildInvestmentMovement({
        id: 0,
        type: InvestmentMovementType.VALUATION,
        account: null,
        amount: -1250,
      }),
    );

    expect(orm).toMatchObject({ accountId: null, amount: '-12.50' });
    expect(orm.id).toBeUndefined();
    expect(InvestmentMovementMapper.toDomain(orm)).toMatchObject({
      account: null,
      amount: -1250,
    });
  });

  it('requires the account relation of a contribution', () => {
    const orm = Object.assign(new InvestmentMovementOrmEntity(), {
      ...InvestmentMovementMapper.toOrm(buildInvestmentMovement({ id: 3 })),
      account: undefined,
    });

    expect(() => InvestmentMovementMapper.toDomain(orm)).toThrow(
      'Movement account relation must be loaded',
    );
  });
});
