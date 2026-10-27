import {
  constantTimeEquals,
  createCsrfSessionId,
  createCsrfToken,
  isCsrfTokenBoundTo,
} from '../csrf-token';

const SECRET = 'cookie-secret-used-only-in-this-spec';
const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_SESSION_ID = '22222222-2222-4222-8222-222222222222';

describe('createCsrfSessionId', () => {
  it('returns a random UUID', () => {
    expect(createCsrfSessionId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(createCsrfSessionId()).not.toBe(createCsrfSessionId());
  });
});

describe('createCsrfToken', () => {
  it('returns a hex nonce and a hex HMAC joined by a dot', () => {
    expect(createCsrfToken(SESSION_ID, SECRET)).toMatch(
      /^[0-9a-f]{64}\.[0-9a-f]{64}$/,
    );
  });

  it('generates a different token on every call for the same session', () => {
    expect(createCsrfToken(SESSION_ID, SECRET)).not.toBe(
      createCsrfToken(SESSION_ID, SECRET),
    );
  });

  it('does not embed the session id in the token', () => {
    expect(createCsrfToken(SESSION_ID, SECRET)).not.toContain(SESSION_ID);
  });
});

describe('isCsrfTokenBoundTo', () => {
  it('accepts a token minted for the same session with the same secret', () => {
    expect(
      isCsrfTokenBoundTo(
        createCsrfToken(SESSION_ID, SECRET),
        SESSION_ID,
        SECRET,
      ),
    ).toBe(true);
  });

  // Token transplantation: a validly signed token from one session must not
  // verify for any other session.
  it('rejects a token minted for another session', () => {
    expect(
      isCsrfTokenBoundTo(
        createCsrfToken(OTHER_SESSION_ID, SECRET),
        SESSION_ID,
        SECRET,
      ),
    ).toBe(false);
  });

  it('rejects a token signed with a different secret', () => {
    expect(
      isCsrfTokenBoundTo(
        createCsrfToken(SESSION_ID, 'other-secret'),
        SESSION_ID,
        SECRET,
      ),
    ).toBe(false);
  });

  it('rejects a token whose nonce was swapped for another token nonce', () => {
    const [, signature] = createCsrfToken(SESSION_ID, SECRET).split('.');
    const [otherNonce] = createCsrfToken(SESSION_ID, SECRET).split('.');

    expect(
      isCsrfTokenBoundTo(`${otherNonce}.${signature}`, SESSION_ID, SECRET),
    ).toBe(false);
  });

  it.each([
    ['an empty string', ''],
    ['a bare nonce', 'a'.repeat(64)],
    ['a short signature', `${'a'.repeat(64)}.${'b'.repeat(10)}`],
    ['uppercase hex', `${'A'.repeat(64)}.${'B'.repeat(64)}`],
    ['extra segments', `${'a'.repeat(64)}.${'b'.repeat(64)}.c`],
  ])('rejects %s', (_label, token) => {
    expect(isCsrfTokenBoundTo(token, SESSION_ID, SECRET)).toBe(false);
  });
});

describe('constantTimeEquals', () => {
  it('returns true for equal strings', () => {
    expect(constantTimeEquals('same', 'same')).toBe(true);
  });

  it('returns false for different strings of equal length', () => {
    expect(constantTimeEquals('same', 'diff')).toBe(false);
  });

  it('returns false for strings of different length', () => {
    expect(constantTimeEquals('short', 'much-longer')).toBe(false);
  });
});
