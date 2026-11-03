export interface MonthRef {
  year: number;
  month: number;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function monthOf(date: string): MonthRef {
  const [year, month] = date.split('-').map(Number);

  return { year, month };
}

export function shiftMonth(ref: MonthRef, offset: number): MonthRef {
  const index = ref.year * 12 + (ref.month - 1) + offset;

  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function compareMonths(left: MonthRef, right: MonthRef): number {
  return left.year * 12 + left.month - (right.year * 12 + right.month);
}

export function daysInMonth(ref: MonthRef): number {
  return new Date(Date.UTC(ref.year, ref.month, 0)).getUTCDate();
}

export function dayOfMonth(ref: MonthRef, day: number): string {
  return `${ref.year}-${pad(ref.month)}-${pad(Math.min(day, daysInMonth(ref)))}`;
}

export function firstDayOf(ref: MonthRef): string {
  return dayOfMonth(ref, 1);
}

export function lastDayOf(ref: MonthRef): string {
  return dayOfMonth(ref, daysInMonth(ref));
}

export function addMonthsToDate(date: string, offset: number): string {
  return dayOfMonth(
    shiftMonth(monthOf(date), offset),
    Number(date.slice(8, 10)),
  );
}
