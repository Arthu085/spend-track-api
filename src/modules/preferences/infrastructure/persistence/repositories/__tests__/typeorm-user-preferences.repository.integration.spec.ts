import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';
import { DefaultMonth } from '../../../../domain/enums/default-month.enum';
import { SpendingPerspective } from '../../../../domain/enums/spending-perspective.enum';
import { UserPreferencesOrmEntity } from '../../entities/user-preferences.orm-entity';
import { TypeOrmUserPreferencesRepository } from '../typeorm-user-preferences.repository';

describe('TypeOrmUserPreferencesRepository (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let repository: TypeOrmUserPreferencesRepository;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        CoreConfigModule,
        DatabaseModule,
        TypeOrmModule.forFeature([UserPreferencesOrmEntity, UserOrmEntity]),
      ],
      providers: [TypeOrmUserPreferencesRepository],
    }).compile();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
    repository = moduleRef.get(TypeOrmUserPreferencesRepository);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "user_preferences", "users" RESTART IDENTITY CASCADE',
    );
  });

  async function insertUser(): Promise<number> {
    const users = dataSource.getRepository(UserOrmEntity);

    const user = await users.save(
      users.create({
        name: 'Owner',
        email: `${randomUUID()}@example.com`,
        password: 'hash',
      }),
    );

    return user.id;
  }

  it('returns null until the user saves preferences', async () => {
    const userId = await insertUser();

    await expect(repository.findByUserId(userId)).resolves.toBeNull();
  });

  it('inserts once and then updates the same row', async () => {
    const userId = await insertUser();

    await repository.save(userId, {
      spendingPerspective: SpendingPerspective.INVOICE_MONTH,
      defaultMonth: DefaultMonth.CURRENT,
    });

    const saved = await repository.save(userId, {
      spendingPerspective: SpendingPerspective.INVOICE_MONTH,
      defaultMonth: DefaultMonth.NEXT,
    });

    expect(saved).toMatchObject({
      spendingPerspective: SpendingPerspective.INVOICE_MONTH,
      defaultMonth: DefaultMonth.NEXT,
    });
    await expect(
      dataSource.getRepository(UserPreferencesOrmEntity).count(),
    ).resolves.toBe(1);
  });

  it('keeps each user preferences separate', async () => {
    const first = await insertUser();
    const second = await insertUser();

    await repository.save(first, {
      spendingPerspective: SpendingPerspective.INVOICE_MONTH,
      defaultMonth: DefaultMonth.NEXT,
    });

    await expect(repository.findByUserId(second)).resolves.toBeNull();
  });
});
