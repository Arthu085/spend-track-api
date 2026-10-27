import 'dotenv/config';
import dataSource from '../data-source';
import { runSeeders } from './run-seeders';
import { seeders } from './seeders';

async function runSeeds(): Promise<void> {
  await dataSource.initialize();

  try {
    await runSeeders(dataSource, seeders);
  } finally {
    await dataSource.destroy();
  }
}

runSeeds().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
