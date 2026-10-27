import { retryDelayMs } from '../retry-delay';

describe('retryDelayMs', () => {
  it.each([
    [1, 1000],
    [2, 2000],
    [3, 4000],
    [4, 8000],
  ])('doubles the base delay for attempt %p', (attempt, expected) => {
    expect(retryDelayMs(attempt, 1000, 60_000)).toBe(expected);
  });

  it('caps the delay at the maximum', () => {
    expect(retryDelayMs(30, 1000, 60_000)).toBe(60_000);
  });

  it('treats an attempt below 1 as the first attempt', () => {
    expect(retryDelayMs(0, 1000, 60_000)).toBe(1000);
  });
});
