import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { Action } from '@shared/domain/enums/action.enum';
import { Subject } from '@shared/domain/authorization/subject';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';
import { AbilityOrmEntity } from '../../entities/ability.orm-entity';
import { RoleOrmEntity } from '../../entities/role.orm-entity';
import { RoleEnum } from '../../../../domain/enums/role.enum';
import { TypeOrmUserAbilityRepository } from '../typeorm-user-ability.repository';

describe('TypeOrmUserAbilityRepository (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let repository: TypeOrmUserAbilityRepository;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        CoreConfigModule,
        DatabaseModule,
        TypeOrmModule.forFeature([
          AbilityOrmEntity,
          RoleOrmEntity,
          UserOrmEntity,
        ]),
      ],
      providers: [TypeOrmUserAbilityRepository],
    }).compile();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
    repository = moduleRef.get(TypeOrmUserAbilityRepository);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "users", "roles", "abilities" RESTART IDENTITY CASCADE',
    );
  });

  async function insertAbility(
    action: Action,
    subject: Subject,
  ): Promise<AbilityOrmEntity> {
    const repo = dataSource.getRepository(AbilityOrmEntity);
    return repo.save(repo.create({ action, subject }));
  }

  async function insertRole(
    name: RoleEnum,
    abilities: AbilityOrmEntity[],
    status: RecordStatus = RecordStatus.ACTIVE,
  ): Promise<RoleOrmEntity> {
    const repo = dataSource.getRepository(RoleOrmEntity);
    const role = repo.create({ name, abilities });
    const saved = await repo.save(role);

    if (status !== RecordStatus.ACTIVE) {
      await repo.update({ id: saved.id }, { status });
    }

    return saved;
  }

  async function insertUser(
    roles: RoleOrmEntity[],
    status: RecordStatus = RecordStatus.ACTIVE,
  ): Promise<UserOrmEntity> {
    const repo = dataSource.getRepository(UserOrmEntity);

    const user = repo.create({
      name: 'Jane Doe',
      email: `${randomUUID()}@example.com`,
      password: 'hashed-password',
      roles,
    });

    const saved = await repo.save(user);

    if (status !== RecordStatus.ACTIVE) {
      await repo.update({ id: saved.id }, { status });
    }

    return saved;
  }

  it('returns the union of abilities across every role the user has', async () => {
    const readUser = await insertAbility(Action.READ, Subject.USER);
    const updateRole = await insertAbility(Action.UPDATE, Subject.ROLE);

    const roleA = await insertRole(RoleEnum.ADMIN, [readUser]);
    const roleB = await insertRole(RoleEnum.USER, [updateRole]);
    const user = await insertUser([roleA, roleB]);

    const result = await repository.findGrantedAbilities(user.uuid);
    const pairs = result.map((pair) => `${pair.action}:${pair.subject}`).sort();

    expect(pairs).toEqual(
      [
        `${Action.READ}:${Subject.USER}`,
        `${Action.UPDATE}:${Subject.ROLE}`,
      ].sort(),
    );
  });

  it('deduplicates an ability shared by two of the user’s roles', async () => {
    const readUser = await insertAbility(Action.READ, Subject.USER);

    const roleA = await insertRole(RoleEnum.ADMIN, [readUser]);
    const roleB = await insertRole(RoleEnum.USER, [readUser]);
    const user = await insertUser([roleA, roleB]);

    const result = await repository.findGrantedAbilities(user.uuid);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ action: Action.READ, subject: Subject.USER });
  });

  it('returns [] for an unknown user uuid', async () => {
    await expect(
      repository.findGrantedAbilities(randomUUID()),
    ).resolves.toEqual([]);
  });

  it('excludes abilities granted only through an INACTIVE role', async () => {
    const readUser = await insertAbility(Action.READ, Subject.USER);
    const updateRole = await insertAbility(Action.UPDATE, Subject.ROLE);

    const activeRole = await insertRole(RoleEnum.ADMIN, [readUser]);

    const inactiveRole = await insertRole(
      RoleEnum.USER,
      [updateRole],
      RecordStatus.INACTIVE,
    );

    const user = await insertUser([activeRole, inactiveRole]);

    const result = await repository.findGrantedAbilities(user.uuid);

    expect(result).toEqual([{ action: Action.READ, subject: Subject.USER }]);
  });

  it('excludes an INACTIVE ability even when an active role grants it', async () => {
    const readUser = await insertAbility(Action.READ, Subject.USER);
    const updateRole = await insertAbility(Action.UPDATE, Subject.ROLE);
    const role = await insertRole(RoleEnum.ADMIN, [readUser, updateRole]);
    const user = await insertUser([role]);

    await dataSource
      .getRepository(AbilityOrmEntity)
      .update({ id: updateRole.id }, { status: RecordStatus.INACTIVE });

    await expect(repository.findGrantedAbilities(user.uuid)).resolves.toEqual([
      { action: Action.READ, subject: Subject.USER },
    ]);
  });

  it('excludes a soft-deleted ability even when an active role grants it', async () => {
    const readUser = await insertAbility(Action.READ, Subject.USER);
    const updateRole = await insertAbility(Action.UPDATE, Subject.ROLE);
    const role = await insertRole(RoleEnum.ADMIN, [readUser, updateRole]);
    const user = await insertUser([role]);

    await dataSource
      .getRepository(AbilityOrmEntity)
      .softDelete({ id: updateRole.id });

    await expect(repository.findGrantedAbilities(user.uuid)).resolves.toEqual([
      { action: Action.READ, subject: Subject.USER },
    ]);
  });

  it('excludes every ability when the user itself is INACTIVE', async () => {
    const readUser = await insertAbility(Action.READ, Subject.USER);
    const role = await insertRole(RoleEnum.ADMIN, [readUser]);
    const user = await insertUser([role], RecordStatus.INACTIVE);

    await expect(repository.findGrantedAbilities(user.uuid)).resolves.toEqual(
      [],
    );
  });

  it('excludes every ability when the user is soft-deleted', async () => {
    const readUser = await insertAbility(Action.READ, Subject.USER);
    const role = await insertRole(RoleEnum.ADMIN, [readUser]);
    const user = await insertUser([role]);

    await dataSource.getRepository(UserOrmEntity).softDelete({ id: user.id });

    await expect(repository.findGrantedAbilities(user.uuid)).resolves.toEqual(
      [],
    );
  });
});
