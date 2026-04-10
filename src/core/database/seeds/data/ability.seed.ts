import { DataSource } from 'typeorm';
import { ISeed } from '../interfaces/seed.interface';
import { AbilityOrmEntity } from 'src/modules/access-control/infra/entities/ability.orm.entity';
import { ActionEnum } from 'src/modules/access-control/domain/enums/action.enum';
import { SubjectEnum } from 'src/modules/access-control/domain/enums/subject.enum';

export class AbilitySeed implements ISeed {
  name = 'AbilitySeed';

  constructor(private readonly dataSource: DataSource) {}

  async run(): Promise<void> {
    const repo = this.dataSource.getRepository(AbilityOrmEntity);

    const abilities: Partial<AbilityOrmEntity>[] = [];

    for (const subject of Object.values(SubjectEnum)) {
      for (const action of Object.values(ActionEnum)) {
        abilities.push({
          action,
          subject,
        });
      }
    }

    await repo.upsert(abilities, {
      conflictPaths: ['action', 'subject'],
      skipUpdateIfNoValuesChanged: true,
    });

    console.log(`${abilities.length} abilities processadas`);
  }
}
