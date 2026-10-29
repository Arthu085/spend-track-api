import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseTransactionalRepository } from '@shared/infrastructure/persistence';
import type {
  StoredUserPreferences,
  UserPreferenceValues,
  UserPreferencesRepository,
} from '../../../domain/repositories/user-preferences.repository';
import { UserPreferencesOrmEntity } from '../entities/user-preferences.orm-entity';

function toStored(orm: UserPreferencesOrmEntity): StoredUserPreferences {
  return {
    spendingPerspective: orm.spendingPerspective,
    defaultMonth: orm.defaultMonth,
    updatedAt: orm.updatedAt,
  };
}

@Injectable()
export class TypeOrmUserPreferencesRepository
  extends BaseTransactionalRepository<UserPreferencesOrmEntity>
  implements UserPreferencesRepository
{
  constructor(
    @InjectRepository(UserPreferencesOrmEntity)
    repository: Repository<UserPreferencesOrmEntity>,
  ) {
    super(repository);
  }

  async findByUserId(userId: number): Promise<StoredUserPreferences | null> {
    const row = await this.repository.findOne({ where: { userId } });

    return row ? toStored(row) : null;
  }

  async save(
    userId: number,
    values: UserPreferenceValues,
  ): Promise<StoredUserPreferences> {
    await this.repository.upsert(
      {
        userId,
        spendingPerspective: values.spendingPerspective,
        defaultMonth: values.defaultMonth,
        updatedAt: new Date(),
      },
      { conflictPaths: ['userId'], skipUpdateIfNoValuesChanged: false },
    );

    return toStored(await this.repository.findOneOrFail({ where: { userId } }));
  }
}
