import { DomainError } from '@shared/domain/errors';
import { ForbiddenError } from '@shared/domain/errors';
import { assertEmailConfirmed } from '../assert-email-confirmed.policy';

describe('assertEmailConfirmed', () => {
  it('does not throw when emailConfirmedAt is set', () => {
    const user = { emailConfirmedAt: new Date() };
    const error = new ForbiddenError();

    expect(() => assertEmailConfirmed(user, error)).not.toThrow();
  });

  it('throws the exact error instance passed in when emailConfirmedAt is null', () => {
    const user = { emailConfirmedAt: null };
    const error: DomainError = new ForbiddenError('some.key');

    expect(() => assertEmailConfirmed(user, error)).toThrow(error);

    try {
      assertEmailConfirmed(user, error);
      throw new Error('expected assertEmailConfirmed to throw');
    } catch (thrown) {
      expect(thrown).toBe(error);
    }
  });
});
