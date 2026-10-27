import { stopEphemeralPostgres } from '../support/postgres/lifecycle';

export default async function globalTeardown(): Promise<void> {
  await stopEphemeralPostgres('integration');
}
