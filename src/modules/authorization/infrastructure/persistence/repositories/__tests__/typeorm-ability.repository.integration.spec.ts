import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import { Subject } from '@shared/domain/authorization/subject';
import { Action } from '@shared/domain/enums/action.enum';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { AbilityOrmEntity } from '../../entities/ability.orm-entity';
import { TypeOrmAbilityRepository } from '../typeorm-ability.repository';

describe('TypeOrmAbilityRepository (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let repository: TypeOrmAbilityRepository;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        CoreConfigModule,
        DatabaseModule,
        TypeOrmModule.forFeature([AbilityOrmEntity]),
      ],
      providers: [TypeOrmAbilityRepository],
    }).compile();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
    repository = moduleRef.get(TypeOrmAbilityRepository);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "abilities" RESTART IDENTITY CASCADE',
    );
  });

  async function insertAbility(action: Action, subject: Subject) {
    const abilityRepo = dataSource.getRepository(AbilityOrmEntity);
    return abilityRepo.save(abilityRepo.create({ action, subject }));
  }

  it('persists an ability and lists it back via findAll', async () => {
    await insertAbility(Action.READ, Subject.USER);

    const all = await repository.findAll();

    expect(all).toHaveLength(1);
    expect(all[0].action).toBe(Action.READ);
    expect(all[0].subject).toBe(Subject.USER);
  });

  it('findByPairs returns only the requested (action, subject) pairs, and [] for an empty input', async () => {
    await insertAbility(Action.READ, Subject.USER);
    await insertAbility(Action.UPDATE, Subject.USER);
    await insertAbility(Action.READ, Subject.ROLE);

    const result = await repository.findByPairs([
      { action: Action.READ, subject: Subject.USER },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].action).toBe(Action.READ);
    expect(result[0].subject).toBe(Subject.USER);

    expect(await repository.findByPairs([])).toEqual([]);
  });

  // The use-case needs the status to reject INACTIVE abilities explicitly
  // instead of reporting them as unknown.
  it('findByPairs returns an INACTIVE ability with its status', async () => {
    const ability = await insertAbility(Action.READ, Subject.USER);

    await dataSource
      .getRepository(AbilityOrmEntity)
      .update({ id: ability.id }, { status: RecordStatus.INACTIVE });

    const result = await repository.findByPairs([
      { action: Action.READ, subject: Subject.USER },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe(RecordStatus.INACTIVE);
  });

  it('findByPairs never resolves a soft-deleted ability', async () => {
    const ability = await insertAbility(Action.READ, Subject.USER);

    await dataSource
      .getRepository(AbilityOrmEntity)
      .softDelete({ id: ability.id });

    await expect(
      repository.findByPairs([{ action: Action.READ, subject: Subject.USER }]),
    ).resolves.toEqual([]);
  });

  it('rejects a second row with the same (action, subject) pair (unique constraint)', async () => {
    await insertAbility(Action.READ, Subject.USER);

    await expect(insertAbility(Action.READ, Subject.USER)).rejects.toThrow(
      QueryFailedError,
    );
  });
});
