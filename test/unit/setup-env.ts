import { applyUnitTestEnv } from './unit-test-env';

// Runs before every unit test file (Jest `setupFiles`). Importing anything from
// `@core/config` validates `process.env` at module-evaluation time, so every
// variable the app schema reads is cleared and the required ones are set to
// fixed values: values exported by a developer's shell or loaded from a local
// `.env` never reach unit tests.
applyUnitTestEnv(process.env);
