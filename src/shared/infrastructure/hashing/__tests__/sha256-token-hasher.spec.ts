import { createHash } from 'node:crypto';
import { Sha256TokenHasher } from '../sha256-token-hasher';

describe('Sha256TokenHasher', () => {
  const hasher = new Sha256TokenHasher();

  it('hashes a token into its lowercase hex SHA-256 digest', () => {
    const expected = createHash('sha256').update('raw-token').digest('hex');

    expect(hasher.hash('raw-token')).toBe(expected);
    expect(hasher.hash('raw-token')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same token and distinct for different tokens', () => {
    expect(hasher.hash('raw-token')).toBe(hasher.hash('raw-token'));
    expect(hasher.hash('raw-token')).not.toBe(hasher.hash('raw-token-2'));
  });

  it('verifies the original token against its hash', () => {
    const hash = hasher.hash('raw-token');

    expect(hasher.verify(hash, 'raw-token')).toBe(true);
  });

  it('rejects a different token against the hash', () => {
    const hash = hasher.hash('raw-token');

    expect(hasher.verify(hash, 'other-token')).toBe(false);
  });

  it('rejects a stored hash of a different length without throwing', () => {
    expect(hasher.verify('short', 'raw-token')).toBe(false);
    expect(hasher.verify('', 'raw-token')).toBe(false);
  });

  // Rows written before the switch to SHA-256 hold argon2 digests; they must fail closed.
  it('rejects a legacy argon2 digest', () => {
    const legacyHash =
      '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG';

    expect(hasher.verify(legacyHash, 'raw-token')).toBe(false);
  });

  it('compares case-sensitively, so an uppercased hash does not match', () => {
    const hash = hasher.hash('raw-token');

    expect(hasher.verify(hash.toUpperCase(), 'raw-token')).toBe(false);
  });
});
