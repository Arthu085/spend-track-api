import { OneTimeToken } from '../one-time-token';

const UUID = '0b9f3c2e-6a51-4d7e-9c1a-2f4b8e6d1a37';

describe('OneTimeToken', () => {
  describe('issue', () => {
    it('generates a v4 uuid and a 32-byte base64url secret', () => {
      const token = OneTimeToken.issue();

      expect(token.uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(token.secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(token.secret, 'base64url')).toHaveLength(32);
    });

    it('generates a distinct uuid and secret on every call', () => {
      const first = OneTimeToken.issue();
      const second = OneTimeToken.issue();

      expect(first.uuid).not.toBe(second.uuid);
      expect(first.secret).not.toBe(second.secret);
    });

    it('serializes as "<uuid>.<secret>"', () => {
      const token = OneTimeToken.issue();

      expect(token.toString()).toBe(`${token.uuid}.${token.secret}`);
    });
  });

  describe('parse', () => {
    it('splits a well-formed value into its uuid and secret', () => {
      const token = OneTimeToken.parse(`${UUID}.secret`);

      expect(token?.uuid).toBe(UUID);
      expect(token?.secret).toBe('secret');
    });

    it('round-trips an issued token', () => {
      const issued = OneTimeToken.issue();
      const parsed = OneTimeToken.parse(issued.toString());

      expect(parsed?.uuid).toBe(issued.uuid);
      expect(parsed?.secret).toBe(issued.secret);
    });

    it('accepts an upper-case uuid', () => {
      expect(OneTimeToken.parse(`${UUID.toUpperCase()}.secret`)).not.toBeNull();
    });

    it.each([
      ['an empty string', ''],
      ['a value without a separator', 'no-dot-here'],
      ['a missing uuid', '.secret'],
      ['a missing secret', `${UUID}.`],
      ['a lone separator', '.'],
      ['an extra segment', `${UUID}.secret.extra`],
      ['a non-uuid prefix', 'token-uuid.secret'],
      ['a uuid with surrounding whitespace', ` ${UUID} .secret`],
    ])('returns null for %s', (_label, value) => {
      expect(OneTimeToken.parse(value)).toBeNull();
    });
  });
});
