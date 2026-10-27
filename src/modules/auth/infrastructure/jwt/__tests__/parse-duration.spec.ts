import { parseDurationMs } from '../parse-duration';

describe('parseDurationMs', () => {
  it('parses a bare millisecond count', () => {
    expect(parseDurationMs('3600000')).toBe(3_600_000);
  });

  it('parses seconds', () => {
    expect(parseDurationMs('900s')).toBe(900_000);
  });

  it('parses minutes', () => {
    expect(parseDurationMs('15m')).toBe(15 * 60 * 1000);
  });

  it('parses hours', () => {
    expect(parseDurationMs('2h')).toBe(2 * 60 * 60 * 1000);
  });

  it('parses days', () => {
    expect(parseDurationMs('7d')).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('parses an explicit ms suffix', () => {
    expect(parseDurationMs('500ms')).toBe(500);
  });

  it('trims surrounding whitespace', () => {
    expect(parseDurationMs('  15m  ')).toBe(15 * 60 * 1000);
  });

  it('throws for garbage input', () => {
    expect(() => parseDurationMs('not-a-duration')).toThrow(
      'Invalid duration string: "not-a-duration"',
    );
  });

  it('throws for an unsupported unit', () => {
    expect(() => parseDurationMs('15w')).toThrow(
      'Invalid duration string: "15w"',
    );
  });

  it('throws for an empty string', () => {
    expect(() => parseDurationMs('')).toThrow();
  });
});
