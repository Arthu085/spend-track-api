import type { EntityManager } from 'typeorm';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { Action } from '@shared/domain/enums/action.enum';
import { Subject } from '@shared/domain/authorization/subject';
import { ROLE_ABILITY_GRANTS } from '../../../domain/catalog/ability-catalog';
import { RoleEnum } from '../../../domain/enums/role.enum';
import { AbilityOrmEntity } from '../../persistence/entities/ability.orm-entity';
import { RoleOrmEntity } from '../../persistence/entities/role.orm-entity';
import { RolesSeeder } from '../roles.seeder';

interface FakeRoleRow {
  name: RoleEnum;
  abilities?: unknown[];
}

describe('RolesSeeder', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function buildManager(
    existing: FakeRoleRow[],
    missingAbilities = 0,
    inactiveAbilities = 0,
  ) {
    const rows = [...existing];

    const findOne = jest.fn(
      ({ where: { name } }: { where: { name: RoleEnum } }) =>
        Promise.resolve(rows.find((row) => row.name === name) ?? null),
    );

    const create = jest.fn((input: FakeRoleRow) => input);

    const save = jest.fn((row: FakeRoleRow) => {
      rows.push(row);
      return Promise.resolve(row);
    });

    const abilityFind = jest.fn(({ where }: { where: unknown[] }) =>
      Promise.resolve(
        where.slice(missingAbilities).map((_, index) => ({
          id: index + 1,
          status:
            index < inactiveAbilities
              ? RecordStatus.INACTIVE
              : RecordStatus.ACTIVE,
        })),
      ),
    );

    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === RoleOrmEntity) {
          return { findOne, create, save };
        }

        if (entity === AbilityOrmEntity) {
          return { find: abilityFind };
        }

        throw new Error('unexpected entity requested');
      }),
    } as unknown as EntityManager;

    return { manager, rows, save, abilityFind };
  }

  it('creates both roles with their default grants when none exist yet', async () => {
    const { manager, rows, save } = buildManager([]);

    await new RolesSeeder().run(manager);

    expect(save).toHaveBeenCalledTimes(2);
    expect(rows.map((row) => row.name).sort()).toEqual(
      [RoleEnum.ADMIN, RoleEnum.USER].sort(),
    );
    expect(
      rows.every(
        (row) => row.abilities?.length === ROLE_ABILITY_GRANTS[row.name].length,
      ),
    ).toBe(true);
  });

  it('queries the default grants of the role being created', async () => {
    const { manager, abilityFind } = buildManager([{ name: RoleEnum.ADMIN }]);

    await new RolesSeeder().run(manager);

    expect(abilityFind).toHaveBeenCalledTimes(1);
    expect(abilityFind).toHaveBeenCalledWith({
      where: [{ action: Action.READ, subject: Subject.USER }],
    });
  });

  // An empty `where` array would match every ability, granting the whole catalog.
  it('creates a role with no grants when its default grant list is empty', async () => {
    jest.replaceProperty(ROLE_ABILITY_GRANTS, RoleEnum.USER, []);

    const { manager, rows, abilityFind } = buildManager([
      { name: RoleEnum.ADMIN },
    ]);

    await new RolesSeeder().run(manager);

    expect(abilityFind).not.toHaveBeenCalled();
    expect(rows.find((row) => row.name === RoleEnum.USER)?.abilities).toEqual(
      [],
    );
  });

  it('skips a role that already exists without touching its grants', async () => {
    const { manager, save } = buildManager([{ name: RoleEnum.ADMIN }]);

    await new RolesSeeder().run(manager);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ name: RoleEnum.USER }),
    );
  });

  it('leaves an INACTIVE default ability out of a new role', async () => {
    const { manager, rows } = buildManager([{ name: RoleEnum.ADMIN }], 0, 1);

    await new RolesSeeder().run(manager);

    expect(rows.find((row) => row.name === RoleEnum.USER)?.abilities).toEqual(
      [],
    );
  });

  it('fails when default abilities of a new role have not been seeded yet', async () => {
    const { manager, save } = buildManager([{ name: RoleEnum.ADMIN }], 1);

    await expect(new RolesSeeder().run(manager)).rejects.toThrow(
      'Cannot seed role "USER": 1 of its default abilities are missing',
    );
    expect(save).not.toHaveBeenCalled();
  });

  it('exposes a stable seeder name', () => {
    expect(new RolesSeeder().name).toBe('roles-seeder');
  });
});
