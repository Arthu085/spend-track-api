import {
  DAY_IN_MS,
  HOUR_IN_MS,
  MINUTE_IN_MS,
  SECOND_IN_MS,
} from '@shared/application/time';

const DURATION_PATTERN = /^(\d+)(ms|s|m|h|d)?$/;

const UNIT_TO_MS: Record<string, number> = {
  ms: 1,
  s: SECOND_IN_MS,
  m: MINUTE_IN_MS,
  h: HOUR_IN_MS,
  d: DAY_IN_MS,
};

export function parseDurationMs(value: string): number {
  const match = DURATION_PATTERN.exec(value.trim());

  if (!match) {
    throw new Error(`Invalid duration string: "${value}"`);
  }

  const amount = Number(match[1]);
  const unit = match[2] ?? 'ms';

  return amount * UNIT_TO_MS[unit];
}
