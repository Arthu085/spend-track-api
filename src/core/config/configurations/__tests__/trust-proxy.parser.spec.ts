import { parseTrustProxy } from '../trust-proxy.parser';

describe('parseTrustProxy', () => {
  it.each([undefined, '', '  ', 'false', 'FALSE', '0'])(
    'disables proxy trust for %p',
    (raw) => {
      expect(parseTrustProxy(raw)).toBe(false);
    },
  );

  it('parses a hop count', () => {
    expect(parseTrustProxy('2')).toBe(2);
  });

  it('parses a comma-separated list of presets, addresses, and CIDR ranges', () => {
    expect(
      parseTrustProxy(' loopback, 10.0.0.0/8 ,fd00::/8, 203.0.113.7, ::1 '),
    ).toEqual(['loopback', '10.0.0.0/8', 'fd00::/8', '203.0.113.7', '::1']);
  });

  it('rejects true because it trusts any client-supplied X-Forwarded-For', () => {
    expect(() => parseTrustProxy('true')).toThrow(/TRUST_PROXY=true/);
  });

  it.each([
    'proxy.internal',
    '10.0.0.0/33',
    '0.0.0.0/0',
    '::/0',
    'fd00::/129',
    '10.0.0.0/8/1',
    '10.0.0.0/abc',
    'loopback,,10.0.0.1',
    '-1',
  ])('rejects the invalid entry in %p', (raw) => {
    expect(() => parseTrustProxy(raw)).toThrow(/TRUST_PROXY entry/);
  });
});
