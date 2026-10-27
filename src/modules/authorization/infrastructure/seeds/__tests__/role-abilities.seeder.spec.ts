import type { EntityManager } from 'typeorm';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { ABILITY_CATALOG } from '../../../domain/catalog/ability-catalog';
import { RoleEnum } from '../../../domain/enums/role.enum';
import { AbilityOrmEntity } from '../../persistence/entities/ability.orm-entity';
import { RoleOrmEntity } from '../../persistence/entities/role.orm-entity';
import { RoleAbilitiesSeeder } from '../role-abilities.seeder';

interface FakeAbilityRow {
  id: number;
  status: RecordStatus;
}

interface FakeRoleRow {
  name: RoleEnum;
  abilities: FakeAbilityRow[];
}

const FULL_CATALOG: FakeAbilityRow[] = ABILITY_CATALOG.map((_, index) => ({
  id: index + 1,
  status: RecordStatus.ACTIVE,
}));

describe('RoleAbilitiesSeeder', () => {
  function buildManager(admin: FakeRoleRow | null, catalog: FakeAbilityRow[]) {
    const roleFindOne = jest.fn().mockResolvedValue(admin);
    const abilityFind = jest.fn().mockResolvedValue(catalog);
    const add = jest.fn().mockResolvedValue(undefined);
    const of = jest.fn().mockReturnValue({ add });
    const relation = jest.fn().mockReturnValue({ of });

    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === RoleOrmEntity) {
          return { findOne: roleFindOne };
        }

        if (entity === AbilityOrmEntity) {
          return { find: abilityFind };
        }

        throw new Error('unexpected entity requested');
      }),
      createQueryBuilder: jest.fn().mockReturnValue({ relation }),
    } as unknown as EntityManager;

    return { manager, roleFindOne, abilityFind, relation, of, add };
  }

  it('adds only the catalog abilities ADMIN is missing, never removing any', async () => {
    const admin: FakeRoleRow = {
      name: RoleEnum.ADMIN,
      abilities: [FULL_CATALOG[0]],
    };

    const { manager, relation, of, add } = buildManager(admin, FULL_CATALOG);

    await new RoleAbilitiesSeeder().run(manager);

    expect(relation).toHaveBeenCalledWith(RoleOrmEntity, 'abilities');
    expect(of).toHaveBeenCalledWith(admin);
    expect(add).toHaveBeenCalledWith(FULL_CATALOG.slice(1));
  });

  it('never grants a missing catalog ability that is INACTIVE', async () => {
    const [inactive, ...active] = FULL_CATALOG;

    const { manager, add } = buildManager(
      { name: RoleEnum.ADMIN, abilities: [] },
      [{ ...inactive, status: RecordStatus.INACTIVE }, ...active],
    );

    await new RoleAbilitiesSeeder().run(manager);

    expect(add).toHaveBeenCalledWith(active);
  });

  it('writes nothing when ADMIN already holds the full catalog', async () => {
    const { manager, add } = buildManager(
      { name: RoleEnum.ADMIN, abilities: FULL_CATALOG },
      FULL_CATALOG,
    );

    await new RoleAbilitiesSeeder().run(manager);

    expect(add).not.toHaveBeenCalled();
  });

  it('fails when the ADMIN role has not been seeded yet', async () => {
    const { manager, abilityFind, add } = buildManager(null, []);

    await expect(new RoleAbilitiesSeeder().run(manager)).rejects.toThrow(
      'Cannot top up role "ADMIN": the role does not exist',
    );
    expect(abilityFind).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it('fails when catalog abilities have not been seeded yet', async () => {
    const { manager, add } = buildManager(
      { name: RoleEnum.ADMIN, abilities: [] },
      FULL_CATALOG.slice(1),
    );

    await expect(new RoleAbilitiesSeeder().run(manager)).rejects.toThrow(
      'Cannot top up role "ADMIN": 1 catalog abilities are missing',
    );
    expect(add).not.toHaveBeenCalled();
  });

  it('looks up only the ADMIN role and its full catalog grant map', async () => {
    const { manager, roleFindOne, abilityFind } = buildManager(
      { name: RoleEnum.ADMIN, abilities: [] },
      FULL_CATALOG,
    );

    await new RoleAbilitiesSeeder().run(manager);

    expect(roleFindOne).toHaveBeenCalledWith({
      where: { name: RoleEnum.ADMIN },
      relations: { abilities: true },
    });
    expect(abilityFind).toHaveBeenCalledWith({
      where: ABILITY_CATALOG.map(({ action, subject }) => ({
        action,
        subject,
      })),
    });
  });

  it('exposes a stable seeder name', () => {
    expect(new RoleAbilitiesSeeder().name).toBe('role-abilities-seeder');
  });
});
