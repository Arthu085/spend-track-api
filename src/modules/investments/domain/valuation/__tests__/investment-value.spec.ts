import { investmentValueOf, targetProgress } from '../investment-value';

describe('investmentValueOf', () => {
  it('adds contributions and adjustments and subtracts withdrawals', () => {
    expect(
      investmentValueOf({
        contributed: 100000,
        withdrawn: 25000,
        adjusted: -1,
      }),
    ).toEqual({
      contributed: 100000,
      withdrawn: 25000,
      adjusted: -1,
      current: 74999,
    });
  });
});

describe('targetProgress', () => {
  it('reports what is left and the whole percentage reached, rounded down', () => {
    expect(targetProgress(33333, 100000)).toEqual({
      remaining: 66667,
      percent: 33,
    });
  });

  it('reports nothing left and more than 100% once the target is exceeded', () => {
    expect(targetProgress(150000, 100000)).toEqual({
      remaining: 0,
      percent: 150,
    });
  });
});
