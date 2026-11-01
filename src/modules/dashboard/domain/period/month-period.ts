import {
  compareMonths,
  daysInMonth as daysIn,
  firstDayOf,
  lastDayOf,
  monthOf,
  type MonthRef,
} from '@shared/domain/calendar';

export { monthOf, shiftMonth, type MonthRef } from '@shared/domain/calendar';

export enum PeriodTiming {
  PAST = 'PAST',
  CURRENT = 'CURRENT',
  FUTURE = 'FUTURE',
}

export interface MonthPeriod extends MonthRef {
  startDate: string;
  endDate: string;
  today: string;
  daysInMonth: number;
  timing: PeriodTiming;
  remainingDays: number;
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
    startDate: firstDayOf(ref),
    endDate: lastDayOf(ref),
    today,
    daysInMonth,
    timing,
    remainingDays,
  };
}
