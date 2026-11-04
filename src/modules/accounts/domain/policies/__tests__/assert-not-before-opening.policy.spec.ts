import { buildAccount } from '@test/support/builders/account.builder';
import { AccountOperationBeforeOpeningError } from '../../errors/account-operation-before-opening.error';
import { assertNotBeforeOpening } from '../assert-not-before-opening.policy';

describe('assertNotBeforeOpening', () => {
  const source = buildAccount({ openingBalanceDate: '2026-01-10' });
  const destination = buildAccount({ openingBalanceDate: '2026-02-10' });

  it('accepts an operation on the opening date', () => {
    expect(() =>
      assertNotBeforeOpening([source], ['2026-01-10']),
    ).not.toThrow();
  });

  it('rejects an operation before the opening date', () => {
    expect(() => assertNotBeforeOpening([source], ['2026-01-09'])).toThrow(
      AccountOperationBeforeOpeningError,
    );
  });

  it('checks every account and every date it receives', () => {
    expect(() =>
      assertNotBeforeOpening([source, destination], ['2026-01-20']),
    ).toThrow(AccountOperationBeforeOpeningError);

    expect(() =>
      assertNotBeforeOpening([source], ['2026-01-20', '2026-01-01']),
    ).toThrow(AccountOperationBeforeOpeningError);
  });

  it('skips missing accounts and dates', () => {
    expect(() =>
      assertNotBeforeOpening([null, source], [null, undefined, '2026-03-01']),
    ).not.toThrow();
  });
});
