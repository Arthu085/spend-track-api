import { retentionCutoff } from '../retention-cutoff';

describe('retentionCutoff', () => {
  const now = new Date('2026-07-29T12:00:00.000Z');

  it('subtracts whole days from the given instant', () => {
    expect(retentionCutoff(now, 7)).toEqual(
      new Date('2026-07-22T12:00:00.000Z'),
    );
  });

  it('crosses month and year boundaries', () => {
    expect(retentionCutoff(now, 365)).toEqual(
      new Date('2025-07-29T12:00:00.000Z'),
    );
  });

  it('does not mutate the given date', () => {
    const original = now.getTime();

    retentionCutoff(now, 30);

    expect(now.getTime()).toBe(original);
  });
});
