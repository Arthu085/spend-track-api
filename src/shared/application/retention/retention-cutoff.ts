import { DAY_IN_MS } from '../time';

export function retentionCutoff(now: Date, retentionDays: number): Date {
  return new Date(now.getTime() - retentionDays * DAY_IN_MS);
}
