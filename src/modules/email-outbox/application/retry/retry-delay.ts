export function retryDelayMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  const exponent = Math.max(attempt - 1, 0);

  return Math.min(baseDelayMs * 2 ** exponent, maxDelayMs);
}
