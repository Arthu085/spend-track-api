import { DataSource, Repository } from 'typeorm';
import AppDataSource from '../data-source';
import { SeedHistoryOrmEntity } from '../entities/seed-history.orm.entity';
import { ISeed } from './interfaces/seed.interface';

class SeedRunner {
  private dataSource: DataSource;
  private seedHistoryRepository: Repository<SeedHistoryOrmEntity>;

  async initialize() {
    this.dataSource = AppDataSource;
    await this.dataSource.initialize();
    console.log('Connection initialized\n');

    this.seedHistoryRepository =
      this.dataSource.getRepository(SeedHistoryOrmEntity);
  }

  async runSeed(seed: ISeed): Promise<void> {
    const hasRun = await this.seedHistoryRepository.findOne({
      where: { name: seed.name },
    });

    if (hasRun) {
      console.log(
        `${seed.name} already executed on ${hasRun.executedAt.toLocaleString('pt-BR')}\n`,
      );
      return;
    }

    console.log(`Executing ${seed.name}...`);
    await seed.run();

    const history = this.seedHistoryRepository.create({ name: seed.name });
    await this.seedHistoryRepository.save(history);
    console.log(`${seed.name} executed successfully!\n`);
  }

  async run() {
    try {
      await this.initialize();

      console.log('Initializing...\n');

      const seeds: ISeed[] = [
        // Add seeds here
      ];

      for (const seed of seeds) {
        await this.runSeed(seed);
      }

      console.log('All seeds processed successfully!');
    } catch (error) {
      console.error('Error occurred while executing seeds:', error);
      process.exit(1);
    } finally {
      await this.dataSource.destroy();
      console.log('Connection with database closed');
    }
  }
}

const seedRunner = new SeedRunner();
seedRunner.run();
