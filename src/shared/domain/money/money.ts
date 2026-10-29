export const MONEY_DECIMAL_PATTERN = /^-?\d{1,12}(\.\d{1,2})?$/;

const MONEY_TOTAL_PATTERN = /^-?\d+(\.\d{1,2})?$/;

export function parseMoney(decimal: string): number {
  if (!MONEY_DECIMAL_PATTERN.test(decimal)) {
    throw new RangeError(`Invalid money amount: ${decimal}`);
  }

  return decimalToCents(decimal);
}

export function parseMoneyTotal(decimal: string): number {
  if (!MONEY_TOTAL_PATTERN.test(decimal)) {
    throw new RangeError(`Invalid money total: ${decimal}`);
  }

  const cents = decimalToCents(decimal);

  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`Money total out of range: ${decimal}`);
  }

  return cents;
}

function decimalToCents(decimal: string): number {
  const negative = decimal.startsWith('-');
  const unsigned = negative ? decimal.slice(1) : decimal;
  const [whole, fraction = ''] = unsigned.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));

  return negative ? -cents : cents;
}

export function formatMoney(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`Invalid money amount in cents: ${cents}`);
  }

  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  const whole = Math.trunc(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, '0');

  return `${sign}${whole}.${fraction}`;
}

export function sumMoney(amounts: readonly number[]): number {
  return amounts.reduce((total, amount) => total + amount, 0);
}
