export const FINANCE_TIME_ZONE = 'America/Sao_Paulo';

export enum PeriodTiming {
  PAST = 'PAST',
  CURRENT = 'CURRENT',
  FUTURE = 'FUTURE',
}

export interface MonthRef {
  year: number;
  month: number;
}

export interface MonthPeriod extends MonthRef {
  startDate: string;
  endDate: string;
  today: string;
  daysInMonth: number;
  timing: PeriodTiming;
  remainingDays: number;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function calendarDateIn(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';

  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function monthOf(date: string): MonthRef {
  const [year, month] = date.split('-').map(Number);

  return { year, month };
}

export function shiftMonth(ref: MonthRef, offset: number): MonthRef {
  const index = ref.year * 12 + (ref.month - 1) + offset;

  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function daysIn(ref: MonthRef): number {
  return new Date(Date.UTC(ref.year, ref.month, 0)).getUTCDate();
}

function compareMonths(left: MonthRef, right: MonthRef): number {
  return left.year * 12 + left.month - (right.year * 12 + right.month);
}

export function resolveMonthPeriod(ref: MonthRef, today: string): MonthPeriod {
  const daysInMonth = daysIn(ref);
  const comparison = compareMonths(ref, monthOf(today));

  const timing =
    comparison < 0
      ? PeriodTiming.PAST
      : comparison > 0
        ? PeriodTiming.FUTURE
        : PeriodTiming.CURRENT;

  const remainingDays = {
    [PeriodTiming.PAST]: 0,
    [PeriodTiming.CURRENT]: daysInMonth - Number(today.slice(8, 10)) + 1,
    [PeriodTiming.FUTURE]: daysInMonth,
  }[timing];

  return {
    year: ref.year,
    month: ref.month,
    startDate: `${ref.year}-${pad(ref.month)}-01`,
    endDate: `${ref.year}-${pad(ref.month)}-${pad(daysInMonth)}`,
    today,
    daysInMonth,
    timing,
    remainingDays,
  };
}
