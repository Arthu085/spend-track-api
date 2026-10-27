import { QueryFailedError } from 'typeorm';
import { isUniqueViolation } from '../unique-violation';

function buildQueryFailedError(driverError: object): QueryFailedError {
  return new QueryFailedError(
    'INSERT',
    [],
    Object.assign(new Error('driver'), driverError),
  );
}

describe('isUniqueViolation', () => {
  it('matches a 23505 error raised by the given constraint', () => {
    const error = buildQueryFailedError({
      code: '23505',
      constraint: 'uq_users_email_active',
    });

    expect(isUniqueViolation(error, 'uq_users_email_active')).toBe(true);
  });

  it('does not match a 23505 error raised by a different constraint', () => {
    const error = buildQueryFailedError({
      code: '23505',
      constraint: 'UQ_users_uuid',
    });

    expect(isUniqueViolation(error, 'uq_users_email_active')).toBe(false);
  });

  it('does not match another Postgres error on the same constraint name', () => {
    const error = buildQueryFailedError({
      code: '23514',
      constraint: 'uq_users_email_active',
    });

    expect(isUniqueViolation(error, 'uq_users_email_active')).toBe(false);
  });

  it('does not match an error that is not a QueryFailedError', () => {
    const error = Object.assign(new Error('boom'), {
      code: '23505',
      constraint: 'uq_users_email_active',
    });

    expect(isUniqueViolation(error, 'uq_users_email_active')).toBe(false);
  });
});
