import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import { Subject } from '@shared/domain/authorization/subject';
import { Action } from '@shared/domain/enums/action.enum';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { RoleEnum } from '../../../domain/enums/role.enum';
import { InactiveAbilityError } from '../../../domain/errors/inactive-ability.error';
import { UnknownAbilityError } from '../../../domain/errors/unknown-ability.error';
import { ABILITY_REPOSITORY } from '../../../domain/repositories/ability.repository';
import { ROLE_REPOSITORY } from '../../../domain/repositories/role.repository';
import { AbilityOrmEntity } from '../../../infrastructure/persistence/entities/ability.orm-entity';
import { RoleOrmEntity } from '../../../infrastructure/persistence/entities/role.orm-entity';
import { TypeOrmAbilityRepository } from '../../../infrastructure/persistence/repositories/typeorm-ability.repository';
import { TypeOrmRoleRepository } from '../../../infrastructure/persistence/repositories/typeorm-role.repository';
import { UpdateRoleAbilitiesUseCase } from '../update-role-abilities.use-case';

describe('UpdateRoleAbilitiesUseCase (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let useCase: UpdateRoleAbilitiesUseCase;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        CoreConfigModule,
        DatabaseModule,
        TypeOrmModule.forFeature([AbilityOrmEntity, RoleOrmEntity]),
      ],
      providers: [
        UpdateRoleAbilitiesUseCase,
        { provide: ROLE_REPOSITORY, useClass: TypeOrmRoleRepository },
        { provide: ABILITY_REPOSITORY, useClass: TypeOrmAbilityRepository },
      ],
    }).compile();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
    useCase = moduleRef.get(UpdateRoleAbilitiesUseCase);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "roles", "abilities" RESTART IDENTITY CASCADE',
    );
  });

  async function insertAbility(
    action: Action,
    subject: Subject,
  ): Promise<AbilityOrmEntity> {
    const repo = dataSource.getRepository(AbilityOrmEntity);
    return repo.save(repo.create({ action, subject }));
  }

  async function insertUserRole(
    abilities: AbilityOrmEntity[],
  ): Promise<RoleOrmEntity> {
    const repo = dataSource.getRepository(RoleOrmEntity);
    return repo.save(repo.create({ name: RoleEnum.USER, abilities }));
  }

  async function grantedPairs(roleId: number): Promise<string[]> {
    const role = await dataSource.getRepository(RoleOrmEntity).findOneOrFail({
      where: { id: roleId },
      relations: { abilities: true },
    });

    return role.abilities
      .map((ability) => `${ability.action}:${ability.subject}`)
      .sort();
  }

  it('grants ACTIVE abilities', async () => {
    await insertAbility(Action.READ, Subject.USER);
    await insertAbility(Action.READ, Subject.ROLE);
    const role = await insertUserRole([]);

    await useCase.execute({
      roleUuid: role.uuid,
      abilities: [
        { action: Action.READ, subject: Subject.USER },
        { action: Action.READ, subject: Subject.ROLE },
      ],
    });

    expect(await grantedPairs(role.id)).toEqual(
      [
        `${Action.READ}:${Subject.ROLE}`,
        `${Action.READ}:${Subject.USER}`,
      ].sort(),
    );
  });

  it('rejects an INACTIVE ability with InactiveAbilityError and keeps the stored grants', async () => {
    const readUser = await insertAbility(Action.READ, Subject.USER);
    const readRole = await insertAbility(Action.READ, Subject.ROLE);
    const role = await insertUserRole([readUser]);

    await dataSource
      .getRepository(AbilityOrmEntity)
      .update({ id: readRole.id }, { status: RecordStatus.INACTIVE });

    await expect(
      useCase.execute({
        roleUuid: role.uuid,
        abilities: [
          { action: Action.READ, subject: Subject.USER },
          { action: Action.READ, subject: Subject.ROLE },
        ],
      }),
    ).rejects.toBeInstanceOf(InactiveAbilityError);

    expect(await grantedPairs(role.id)).toEqual([
      `${Action.READ}:${Subject.USER}`,
    ]);
  });

  it('rejects a soft-deleted ability with UnknownAbilityError and keeps the stored grants', async () => {
    const readUser = await insertAbility(Action.READ, Subject.USER);
    const readRole = await insertAbility(Action.READ, Subject.ROLE);
    const role = await insertUserRole([readUser]);

    await dataSource
      .getRepository(AbilityOrmEntity)
      .softDelete({ id: readRole.id });

    await expect(
      useCase.execute({
        roleUuid: role.uuid,
        abilities: [{ action: Action.READ, subject: Subject.ROLE }],
      }),
    ).rejects.toBeInstanceOf(UnknownAbilityError);

    expect(await grantedPairs(role.id)).toEqual([
      `${Action.READ}:${Subject.USER}`,
    ]);
  });
});
