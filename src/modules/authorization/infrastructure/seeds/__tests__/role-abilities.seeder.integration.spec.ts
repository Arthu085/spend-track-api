import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import { Action } from '@shared/domain/enums/action.enum';
import { Subject } from '@shared/domain/authorization/subject';
import { ABILITY_CATALOG } from '../../../domain/catalog/ability-catalog';
import { RoleEnum } from '../../../domain/enums/role.enum';
import { AbilitiesSeeder } from '../abilities.seeder';
import { RoleAbilitiesSeeder } from '../role-abilities.seeder';
import { RolesSeeder } from '../roles.seeder';

interface GrantRow {
  action: Action;
  subject: Subject;
}

function pairKey({ action, subject }: GrantRow): string {
  return `${action}:${subject}`;
}

describe('RoleAbilitiesSeeder (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [CoreConfigModule, DatabaseModule],
    }).compile();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "roles", "abilities" RESTART IDENTITY CASCADE',
    );
  });

  async function runAuthorizationSeeds(): Promise<void> {
    await new AbilitiesSeeder().run(dataSource.manager);
    await new RolesSeeder().run(dataSource.manager);
    await new RoleAbilitiesSeeder().run(dataSource.manager);
  }

  async function grantsOf(role: RoleEnum): Promise<string[]> {
    const rows: GrantRow[] = await dataSource.query(
      `
        SELECT a.action AS action, a.subject AS subject
        FROM "role_abilities" ra
        JOIN "roles" r ON r.id = ra.role_id
        JOIN "abilities" a ON a.id = ra.ability_id
        WHERE r.name = $1
      `,
      [role],
    );

    return rows.map(pairKey).sort();
  }

  // Writes the same join rows PATCH /roles/:uuid/abilities would leave behind.
  async function replaceGrants(role: RoleEnum, pairs: GrantRow[]) {
    await dataSource.query(
      `DELETE FROM "role_abilities"
       WHERE role_id = (SELECT id FROM "roles" WHERE name = $1)`,
      [role],
    );

    for (const { action, subject } of pairs) {
      await dataSource.query(
        `
          INSERT INTO "role_abilities" (role_id, ability_id)
          SELECT r.id, a.id FROM "roles" r, "abilities" a
          WHERE r.name = $1 AND a.action = $2 AND a.subject = $3
        `,
        [role, action, subject],
      );
    }
  }

  it('seeds the default grants when roles are first created, idempotently', async () => {
    await runAuthorizationSeeds();

    const adminGrants = await grantsOf(RoleEnum.ADMIN);
    const userGrants = await grantsOf(RoleEnum.USER);

    expect(adminGrants).toEqual(ABILITY_CATALOG.map(pairKey).sort());
    expect(userGrants).toEqual([
      pairKey({ action: Action.READ, subject: Subject.USER }),
    ]);

    await runAuthorizationSeeds();

    expect(await grantsOf(RoleEnum.ADMIN)).toEqual(adminGrants);
    expect(await grantsOf(RoleEnum.USER)).toEqual(userGrants);
  });

  it('keeps runtime grant changes on an existing role across re-seeds', async () => {
    await runAuthorizationSeeds();

    const runtimeGrants: GrantRow[] = [
      { action: Action.READ, subject: Subject.ROLE },
      { action: Action.UPDATE, subject: Subject.USER },
    ];

    await replaceGrants(RoleEnum.USER, runtimeGrants);

    await runAuthorizationSeeds();

    expect(await grantsOf(RoleEnum.USER)).toEqual(
      runtimeGrants.map(pairKey).sort(),
    );
  });

  it('keeps a fully revoked role empty across re-seeds', async () => {
    await runAuthorizationSeeds();

    await replaceGrants(RoleEnum.USER, []);

    await runAuthorizationSeeds();

    expect(await grantsOf(RoleEnum.USER)).toEqual([]);
  });

  it('adds catalog abilities missing from ADMIN without removing existing grants', async () => {
    await runAuthorizationSeeds();

    const missing: GrantRow = {
      action: Action.DELETE,
      subject: Subject.ABILITY,
    };

    await dataSource.query(
      `
        DELETE FROM "role_abilities"
        WHERE role_id = (SELECT id FROM "roles" WHERE name = $1)
          AND ability_id = (
            SELECT id FROM "abilities" WHERE action = $2 AND subject = $3
          )
      `,
      [RoleEnum.ADMIN, missing.action, missing.subject],
    );

    expect(await grantsOf(RoleEnum.ADMIN)).not.toContain(pairKey(missing));

    await new RoleAbilitiesSeeder().run(dataSource.manager);

    expect(await grantsOf(RoleEnum.ADMIN)).toEqual(
      ABILITY_CATALOG.map(pairKey).sort(),
    );
  });

  it('does not top up ADMIN with a missing catalog ability that is INACTIVE', async () => {
    await runAuthorizationSeeds();

    const inactive: GrantRow = {
      action: Action.DELETE,
      subject: Subject.ABILITY,
    };

    await dataSource.query(
      `
        DELETE FROM "role_abilities"
        WHERE role_id = (SELECT id FROM "roles" WHERE name = $1)
          AND ability_id = (
            SELECT id FROM "abilities" WHERE action = $2 AND subject = $3
          )
      `,
      [RoleEnum.ADMIN, inactive.action, inactive.subject],
    );

    await dataSource.query(
      `UPDATE "abilities" SET status = 'INACTIVE' WHERE action = $1 AND subject = $2`,
      [inactive.action, inactive.subject],
    );

    await new RoleAbilitiesSeeder().run(dataSource.manager);

    expect(await grantsOf(RoleEnum.ADMIN)).toEqual(
      ABILITY_CATALOG.map(pairKey)
        .filter((key) => key !== pairKey(inactive))
        .sort(),
    );
  });
});
