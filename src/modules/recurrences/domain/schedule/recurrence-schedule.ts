import { addDaysToDate, addMonthsToDate } from '@shared/domain/calendar';
import { RecurrenceFrequency } from '../enums/recurrence-frequency.enum';

export interface ScheduleWindow {
  after: string | null;
  until: string;
}

export function occurrenceDateAt(
  startDate: string,
  frequency: RecurrenceFrequency,
  index: number,
): string {
  switch (frequency) {
    case RecurrenceFrequency.WEEKLY:
      return addDaysToDate(startDate, index * 7);
    case RecurrenceFrequency.MONTHLY:
      return addMonthsToDate(startDate, index);
    case RecurrenceFrequency.YEARLY:
      return addMonthsToDate(startDate, index * 12);
  }
}

export function scheduleDates(
  startDate: string,
  frequency: RecurrenceFrequency,
  window: ScheduleWindow,
): string[] {
  const dates: string[] = [];

  for (
    let index = 0, date = startDate;
    date <= window.until;
    index += 1, date = occurrenceDateAt(startDate, frequency, index)
  ) {
    if (window.after === null || date > window.after) {
      dates.push(date);
    }
  }

  return dates;
}

export function firstScheduleDateFrom(
  startDate: string,
  frequency: RecurrenceFrequency,
  from: string,
): string {
  let index = 0;
  let date = startDate;

  while (date < from) {
    index += 1;
    date = occurrenceDateAt(startDate, frequency, index);
  }

  return date;
}
