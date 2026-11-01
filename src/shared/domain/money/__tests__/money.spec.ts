import { formatMoney, parseMoney, parseMoneyTotal, sumMoney } from '../money';

describe('money', () => {
  it.each([
    ['0', 0],
    ['0.5', 50],
    ['10.05', 1005],
    ['1500.00', 150000],
    ['-20.5', -2050],
    ['999999999999.99', 99999999999999],
  ])('parses %s into %i cents', (decimal, cents) => {
    expect(parseMoney(decimal)).toBe(cents);
  });

  it.each(['', '1.234', '1,50', 'abc', '1e3', '0.1.2', '1000000000000'])(
    'rejects %p',
    (decimal) => {
      expect(() => parseMoney(decimal)).toThrow(RangeError);
    },
  );

  it.each([
    ['1200000000000.00', 120000000000000],
    ['-1200000000000.5', -120000000000050],
    ['42', 4200],
  ])(
    'parses the aggregate total %s into %i cents beyond 12 digits',
    (decimal, cents) => {
      expect(parseMoneyTotal(decimal)).toBe(cents);
    },
  );

  it.each(['', '1.234', '1e3', 'abc', '90071992547409.92'])(
    'rejects the aggregate total %p',
    (decimal) => {
      expect(() => parseMoneyTotal(decimal)).toThrow(RangeError);
    },
  );

  it.each([
    [0, '0.00'],
    [5, '0.05'],
    [150000, '1500.00'],
    [-2050, '-20.50'],
    [-5, '-0.05'],
  ])('formats %i cents as %s', (cents, decimal) => {
    expect(formatMoney(cents)).toBe(decimal);
  });

  it('rejects fractional cents', () => {
    expect(() => formatMoney(10.5)).toThrow(RangeError);
  });

  // 0.1 + 0.2 is not 0.3 in floating point; integer cents keep sums exact.
  it('sums amounts without floating-point drift', () => {
    expect(formatMoney(sumMoney([parseMoney('0.1'), parseMoney('0.2')]))).toBe(
      '0.30',
    );
    expect(sumMoney([])).toBe(0);
  });
});
