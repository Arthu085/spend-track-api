export const FINANCE_TIME_ZONE = 'America/Sao_Paulo';

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

export function financeToday(now: Date = new Date()): string {
  return calendarDateIn(now, FINANCE_TIME_ZONE);
}
