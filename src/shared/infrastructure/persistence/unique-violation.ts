import { QueryFailedError } from 'typeorm';

const POSTGRES_UNIQUE_VIOLATION = '23505';

interface PostgresDriverError {
  code?: unknown;
  constraint?: unknown;
}

export function isUniqueViolation(error: unknown, constraint: string): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const driverError = error.driverError as PostgresDriverError;

  return (
    driverError.code === POSTGRES_UNIQUE_VIOLATION &&
    driverError.constraint === constraint
  );
}
