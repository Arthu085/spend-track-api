import { DataSource } from 'typeorm';
import { Seeder } from './seeder.interface';

export async function runSeeders(
  dataSource: DataSource,
  seeders: readonly Seeder[],
): Promise<void> {
  await dataSource.transaction(async (manager) => {
    for (const seeder of seeders) {
      try {
        await seeder.run(manager);
      } catch (error) {
        throw new Error(`Seeder "${seeder.name}" failed`, { cause: error });
      }
    }
  });
}
