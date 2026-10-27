import type { Repository } from 'typeorm';
import { Action } from '@shared/domain/enums/action.enum';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { Subject } from '@shared/domain/authorization/subject';
import { AbilityEntity } from '../../../../domain/entities/ability.entity';
import { AbilityOrmEntity } from '../../entities/ability.orm-entity';
import { TypeOrmAbilityRepository } from '../typeorm-ability.repository';

function buildOrmAbility(): AbilityOrmEntity {
  const orm = new AbilityOrmEntity();
  orm.id = 1;
  orm.uuid = 'ability-uuid';
  orm.status = RecordStatus.ACTIVE;
  orm.action = Action.READ;
  orm.subject = Subject.USER;
  orm.createdAt = new Date();
  orm.updatedAt = new Date();
  orm.deletedAt = null;
  return orm;
}

describe('TypeOrmAbilityRepository', () => {
  it('findAll maps every ORM row to a domain entity', async () => {
    const find = jest.fn().mockResolvedValue([buildOrmAbility()]);
    const repository = { find } as unknown as Repository<AbilityOrmEntity>;
    const adapter = new TypeOrmAbilityRepository(repository);

    const result = await adapter.findAll();

    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(AbilityEntity);
  });

  it('findByPairs short-circuits to [] for an empty input without querying', async () => {
    const find = jest.fn();
    const repository = { find } as unknown as Repository<AbilityOrmEntity>;
    const adapter = new TypeOrmAbilityRepository(repository);

    await expect(adapter.findByPairs([])).resolves.toEqual([]);
    expect(find).not.toHaveBeenCalled();
  });

  it('findByPairs queries by the given (action, subject) pairs', async () => {
    const find = jest.fn().mockResolvedValue([buildOrmAbility()]);
    const repository = { find } as unknown as Repository<AbilityOrmEntity>;
    const adapter = new TypeOrmAbilityRepository(repository);

    const pairs = [{ action: Action.READ, subject: Subject.USER }];
    const result = await adapter.findByPairs(pairs);

    expect(find).toHaveBeenCalledWith({ where: pairs });
    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(AbilityEntity);
  });
});
