import {
  dayOfMonth,
  firstDayOf,
  monthOf,
  shiftMonth,
  type MonthRef,
} from '@shared/domain/calendar';

export interface BillingDays {
  closingDay: number;
  dueDay: number;
}

export interface InvoiceCycle {
  referenceMonth: string;
  closingDate: string;
  dueDate: string;
}

export function invoiceCycleOf(
  days: BillingDays,
  reference: MonthRef,
): InvoiceCycle {
  const closingMonth =
    days.closingDay < days.dueDay ? reference : shiftMonth(reference, -1);

  return {
    referenceMonth: firstDayOf(reference),
    closingDate: dayOfMonth(closingMonth, days.closingDay),
    dueDate: dayOfMonth(reference, days.dueDay),
  };
}

export function invoiceReferenceFor(days: BillingDays, date: string): MonthRef {
  let reference = monthOf(date);

  while (invoiceCycleOf(days, reference).closingDate <= date) {
    reference = shiftMonth(reference, 1);
  }

  return reference;
}

export function isInvoiceClosed(
  cycle: Pick<InvoiceCycle, 'closingDate'>,
  today: string,
): boolean {
  return cycle.closingDate <= today;
}
