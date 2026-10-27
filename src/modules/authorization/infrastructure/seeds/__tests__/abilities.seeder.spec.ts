import type { EntityManager } from 'typeorm';
import { Action } from '@shared/domain/enums/action.enum';
import { ABILITY_CATALOG } from '../../../domain/catalog/ability-catalog';
import { AbilitiesSeeder } from '../abilities.seeder';

interface FakeAbilityRow {
  action: Action;
  subject: string;
}

describe('AbilitiesSeeder', () => {
  function buildManager(existing: FakeAbilityRow[]) {
    const rows = [...existing];

    const findOne = jest.fn(
      ({
        where: { action, subject },
      }: {
        where: { action: Action; subject: string };
      }) =>
        Promise.resolve(
          rows.find(
            (row) => row.action === action && row.subject === subject,
          ) ?? null,
        ),
    );

    const create = jest.fn((input: FakeAbilityRow) => input);

    const save = jest.fn((row: FakeAbilityRow) => {
      rows.push(row);
      return Promise.resolve(row);
    });

    const manager = {
      getRepository: jest.fn().mockReturnValue({ findOne, create, save }),
    } as unknown as EntityManager;

    return { manager, rows, save };
  }

  it('creates the full catalog when nothing exists yet', async () => {
    const { rows, save, manager } = buildManager([]);

    await new AbilitiesSeeder().run(manager);

    expect(save).toHaveBeenCalledTimes(ABILITY_CATALOG.length);
    expect(rows).toHaveLength(ABILITY_CATALOG.length);
  });

  it('skips pairs that already exist (idempotent)', async () => {
    const { save, manager } = buildManager([ABILITY_CATALOG[0]]);

    await new AbilitiesSeeder().run(manager);

    expect(save).toHaveBeenCalledTimes(ABILITY_CATALOG.length - 1);
  });

  it('exposes a stable seeder name', () => {
    expect(new AbilitiesSeeder().name).toBe('abilities-seeder');
  });
});
