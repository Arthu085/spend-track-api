import { DataSource } from 'typeorm';
import { ISeed } from './interfaces/seed.interface';
import AppDataSource from '../data-source';
import { RoleSeed } from './data/role.seed';
import { AbilitySeed } from './data/ability.seed';
import { RoleAbilitySeed } from './data/role-ability.seed';

class SeedRunner {
  private dataSource: DataSource;

  async initialize() {
    this.dataSource = AppDataSource;
    await this.dataSource.initialize();
    console.log('Conexão Inicializada\n');
  }

  async runSeed(seed: ISeed): Promise<void> {
    console.log(`Executando ${seed.name}...`);
    await seed.run();
    console.log(`${seed.name} Completado!\n`);
  }

  async run() {
    try {
      await this.initialize();

      console.log('Iniciando execução dos seeds...\n');

      const seeds: ISeed[] = [
        new RoleSeed(this.dataSource),
        new AbilitySeed(this.dataSource),
        new RoleAbilitySeed(this.dataSource),
      ];

      for (const seed of seeds) {
        await this.runSeed(seed);
      }

      console.log('Todos os seeds executados com sucesso!');
    } catch (error) {
      console.error('Erro:', error);
      process.exit(1);
    } finally {
      await this.dataSource.destroy();
      console.log('Conexão com o banco de dados fechada');
    }
  }
}

const seedRunner = new SeedRunner();
seedRunner.run();
