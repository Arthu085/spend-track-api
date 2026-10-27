import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import { Subject } from '@shared/domain/authorization/subject';
import { Action } from '@shared/domain/enums/action.enum';
import { RoleEnum } from '../../../../domain/enums/role.enum';
import { AbilityMapper } from '../../mappers/ability.mapper';
import { AbilityOrmEntity } from '../../entities/ability.orm-entity';
import { RoleOrmEntity } from '../../entities/role.orm-entity';
import { TypeOrmRoleRepository } from '../typeorm-role.repository';

describe('TypeOrmRoleRepository (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let repository: TypeOrmRoleRepository;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        CoreConfigModule,
        DatabaseModule,
        TypeOrmModule.forFeature([RoleOrmEntity, AbilityOrmEntity]),
      ],
      providers: [TypeOrmRoleRepository],
    }).compile();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
    repository = moduleRef.get(TypeOrmRoleRepository);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "roles", "abilities" RESTART IDENTITY CASCADE',
    );
  });

  async function insertAbility(action: Action, subject: Subject) {
    const abilityRepo = dataSource.getRepository(AbilityOrmEntity);
    return abilityRepo.save(abilityRepo.create({ action, subject }));
  }

  async function insertRole(name: RoleEnum) {
    const roleRepo = dataSource.getRepository(RoleOrmEntity);
    return roleRepo.save(roleRepo.create({ name }));
  }

  it('persists a role and reads it back with an empty abilities relation', async () => {
    const roleRow = await insertRole(RoleEnum.ADMIN);

    const found = await repository.findByUuid(roleRow.uuid);

    expect(found).not.toBeNull();
    expect(found?.name).toBe(RoleEnum.ADMIN);
    expect(found?.abilities).toEqual([]);
  });

  it('findAll lists every role with its abilities (N:N) relation populated', async () => {
    const ability = await insertAbility(Action.READ, Subject.USER);
    const roleRepo = dataSource.getRepository(RoleOrmEntity);

    const role = await roleRepo.save(
      roleRepo.create({
        name: RoleEnum.ADMIN,
        abilities: [ability],
      }),
    );

    const all = await repository.findAll();
    const found = all.find((r) => r.uuid === role.uuid);

    expect(found).toBeDefined();
    expect(found?.abilities).toHaveLength(1);
    expect(found?.abilities[0].action).toBe(Action.READ);
    expect(found?.abilities[0].subject).toBe(Subject.USER);
  });

  it('findByUuids returns only matching roles, and [] for an empty input', async () => {
    const roleA = await insertRole(RoleEnum.ADMIN);
    await insertRole(RoleEnum.USER);

    const result = await repository.findByUuids([roleA.uuid]);

    expect(result).toHaveLength(1);
    expect(result[0].uuid).toBe(roleA.uuid);
    expect(await repository.findByUuids([])).toEqual([]);
  });

  it('update replaces the granted ability set rather than appending to it', async () => {
    const abilityRead = await insertAbility(Action.READ, Subject.USER);
    const abilityUpdate = await insertAbility(Action.UPDATE, Subject.USER);
    const roleRow = await insertRole(RoleEnum.ADMIN);

    const initial = await repository.findByUuid(roleRow.uuid);
    expect(initial).not.toBeNull();

    const withRead = initial!.withAbilities([
      AbilityMapper.toDomain(abilityRead),
    ]);

    const afterFirstUpdate = await repository.update(withRead);

    expect(afterFirstUpdate.abilities).toHaveLength(1);
    expect(afterFirstUpdate.abilities[0].subject).toBe(Subject.USER);
    expect(afterFirstUpdate.abilities[0].action).toBe(Action.READ);

    const withUpdate = afterFirstUpdate.withAbilities([
      AbilityMapper.toDomain(abilityUpdate),
    ]);

    const afterSecondUpdate = await repository.update(withUpdate);

    expect(afterSecondUpdate.abilities).toHaveLength(1);
    expect(afterSecondUpdate.abilities[0].action).toBe(Action.UPDATE);

    const reloaded = await repository.findByUuid(roleRow.uuid);
    expect(reloaded?.abilities).toHaveLength(1);
    expect(reloaded?.abilities[0].action).toBe(Action.UPDATE);
  });

  it('update clears every junction row when the ability set is empty', async () => {
    const abilityRead = await insertAbility(Action.READ, Subject.USER);
    const abilityUpdate = await insertAbility(Action.UPDATE, Subject.USER);
    // USER, not ADMIN: the admin-immutability guard lives in the use-case,
    // not the repository, so it isn't exercised here.
    const roleRow = await insertRole(RoleEnum.USER);

    const initial = await repository.findByUuid(roleRow.uuid);
    expect(initial).not.toBeNull();

    const withBoth = initial!.withAbilities([
      AbilityMapper.toDomain(abilityRead),
      AbilityMapper.toDomain(abilityUpdate),
    ]);

    const afterGrant = await repository.update(withBoth);
    expect(afterGrant.abilities).toHaveLength(2);

    const afterClear = await repository.update(afterGrant.withAbilities([]));

    expect(afterClear.abilities).toEqual([]);

    const reloaded = await repository.findByUuid(roleRow.uuid);
    expect(reloaded?.abilities).toEqual([]);

    const rows = await dataSource.query<Array<{ count: string }>>(
      'SELECT COUNT(*) FROM "role_abilities" WHERE "role_id" = $1',
      [roleRow.id],
    );

    expect(Number(rows[0].count)).toBe(0);
  });
});
