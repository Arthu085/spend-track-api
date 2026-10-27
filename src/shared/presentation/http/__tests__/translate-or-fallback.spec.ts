import { translateOrFallback } from '../translate-or-fallback';

describe('translateOrFallback', () => {
  it('returns the translated value when the key resolves', () => {
    const translate = jest.fn((key: string) => `translated:${key}`);

    expect(translateOrFallback(translate, 'some.key', 'FALLBACK')).toBe(
      'translated:some.key',
    );
    expect(translate).toHaveBeenCalledWith('some.key');
  });

  it('falls back to the provided value when translate returns the key unchanged', () => {
    const translate = jest.fn((key: string) => key);

    expect(translateOrFallback(translate, 'missing.key', 'FALLBACK')).toBe(
      'FALLBACK',
    );
  });
});
