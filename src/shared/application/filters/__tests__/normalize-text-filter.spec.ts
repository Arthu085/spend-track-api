import { normalizeTextFilter } from '../normalize-text-filter';

describe('normalizeTextFilter', () => {
  it('trims surrounding whitespace and returns the trimmed value', () => {
    expect(normalizeTextFilter('  ali  ')).toBe('ali');
  });

  it('returns undefined for an empty string', () => {
    expect(normalizeTextFilter('')).toBeUndefined();
  });

  it('returns undefined for a whitespace-only string', () => {
    expect(normalizeTextFilter('   ')).toBeUndefined();
  });

  it('returns undefined when the value is undefined', () => {
    expect(normalizeTextFilter(undefined)).toBeUndefined();
  });

  it('returns a value with no surrounding whitespace unchanged', () => {
    expect(normalizeTextFilter('ali')).toBe('ali');
  });
});
