import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestSuite } from './connection-handoff';

// globalSetup and globalTeardown run in the same Jest main process (unlike
// test workers), so the started container can be handed off via globalThis.
// Keyed by suite so integration and e2e globalSetup/globalTeardown pairs,
// which run in separate Jest processes but could still both populate this
// same globalThis if ever invoked together, don't clobber each other.
const registry = globalThis as typeof globalThis & {
  __testcontainersPostgres__?: Partial<
    Record<TestSuite, StartedPostgreSqlContainer>
  >;
};

export function setPostgresContainer(
  suite: TestSuite,
  container: StartedPostgreSqlContainer,
): void {
  registry.__testcontainersPostgres__ ??= {};
  registry.__testcontainersPostgres__[suite] = container;
}

export function getPostgresContainer(
  suite: TestSuite,
): StartedPostgreSqlContainer | undefined {
  return registry.__testcontainersPostgres__?.[suite];
}
