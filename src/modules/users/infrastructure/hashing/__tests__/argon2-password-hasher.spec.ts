import { Argon2PasswordHasher } from '../argon2-password-hasher';

describe('Argon2PasswordHasher', () => {
  const hasher = new Argon2PasswordHasher();

  it('hashes a plain password into a non-reversible argon2 digest', async () => {
    const hash = await hasher.hash('StrongPass123!');

    expect(hash).not.toBe('StrongPass123!');
    expect(hash.startsWith('$argon2')).toBe(true);
  });

  it('verifies the correct plain password against its hash', async () => {
    const hash = await hasher.hash('StrongPass123!');

    await expect(hasher.verify(hash, 'StrongPass123!')).resolves.toBe(true);
  });

  it('rejects an incorrect plain password against the hash', async () => {
    const hash = await hasher.hash('StrongPass123!');

    await expect(hasher.verify(hash, 'WrongPassword')).resolves.toBe(false);
  });
});
