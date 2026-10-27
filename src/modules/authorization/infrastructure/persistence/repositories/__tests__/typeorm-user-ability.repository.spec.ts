import type { Repository, SelectQueryBuilder } from 'typeorm';
import { Action } from '@shared/domain/enums/action.enum';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { Subject } from '@shared/domain/authorization/subject';
import { AbilityOrmEntity } from '../../entities/ability.orm-entity';
import { TypeOrmUserAbilityRepository } from '../typeorm-user-ability.repository';

function buildOrmAbility(action: Action, subject: Subject): AbilityOrmEntity {
  const orm = new AbilityOrmEntity();
  orm.id = 1;
  orm.uuid = 'ability-uuid';
  orm.status = RecordStatus.ACTIVE;
  orm.action = action;
  orm.subject = subject;
  orm.createdAt = new Date();
  orm.updatedAt = new Date();
  orm.deletedAt = null;
  return orm;
}

interface QueryBuilderMock {
  qb: SelectQueryBuilder<AbilityOrmEntity>;
  where: jest.Mock;
  andWhere: jest.Mock;
  getMany: jest.Mock;
}

function buildQueryBuilderMock(rows: AbilityOrmEntity[]): QueryBuilderMock {
  const where = jest.fn();
  const andWhere = jest.fn();
  const getMany = jest.fn().mockResolvedValue(rows);

  const qb = {
    where: where.mockReturnThis(),
    andWhere: andWhere.mockReturnThis(),
    getMany,
  } as unknown as SelectQueryBuilder<AbilityOrmEntity>;

  return { qb, where, andWhere, getMany };
}

describe('TypeOrmUserAbilityRepository', () => {
  it('builds the query via createQueryBuilder scoped to the ability table', async () => {
    const { qb, where } = buildQueryBuilderMock([
      buildOrmAbility(Action.READ, Subject.USER),
    ]);

    const createQueryBuilder = jest.fn().mockReturnValue(qb);

    const repository = {
      createQueryBuilder,
    } as unknown as Repository<AbilityOrmEntity>;

    const adapter = new TypeOrmUserAbilityRepository(repository);

    await adapter.findGrantedAbilities('user-uuid');

    expect(createQueryBuilder).toHaveBeenCalledWith('ability');
    expect(where).toHaveBeenCalledWith('ability.deletedAt IS NULL');
  });

  it('only resolves ACTIVE abilities', async () => {
    const { qb, andWhere } = buildQueryBuilderMock([]);
    const createQueryBuilder = jest.fn().mockReturnValue(qb);

    const repository = {
      createQueryBuilder,
    } as unknown as Repository<AbilityOrmEntity>;

    const adapter = new TypeOrmUserAbilityRepository(repository);

    await adapter.findGrantedAbilities('user-uuid');

    expect(andWhere).toHaveBeenCalledWith(
      'ability.status = :abilityActiveStatus',
      { abilityActiveStatus: RecordStatus.ACTIVE },
    );
  });

  it('joins through role_abilities/roles/user_roles/users and filters by the user uuid, active status', async () => {
    const { qb, andWhere } = buildQueryBuilderMock([]);
    const createQueryBuilder = jest.fn().mockReturnValue(qb);

    const repository = {
      createQueryBuilder,
    } as unknown as Repository<AbilityOrmEntity>;

    const adapter = new TypeOrmUserAbilityRepository(repository);

    await adapter.findGrantedAbilities('user-uuid');

    expect(andWhere).toHaveBeenCalledTimes(2);

    const [rawFragment, params] = andWhere.mock.calls.find(
      ([fragment]) => typeof fragment === 'string' && fragment.includes('IN ('),
    ) as [string, Record<string, unknown>];

    // Normalize whitespace so this assertion doesn't depend on exactly how
    // the multi-line raw SQL template happens to be indented/wrapped.
    const fragment = rawFragment.replace(/\s+/g, ' ').trim();

    expect(fragment).toContain('SELECT role_abilities.ability_id');
    expect(fragment).toContain('FROM role_abilities');
    expect(fragment).toContain(
      'INNER JOIN roles ON roles.id = role_abilities.role_id',
    );
    expect(fragment).toContain(
      'INNER JOIN user_roles ON user_roles.role_id = roles.id',
    );
    expect(fragment).toContain(
      'INNER JOIN users ON users.id = user_roles.user_id',
    );
    expect(fragment).toContain('WHERE users.uuid = :userUuid');
    expect(fragment).toContain('AND users.deleted_at IS NULL');
    expect(fragment).toContain('AND users.status = :userActiveStatus');
    expect(fragment).toContain('AND roles.deleted_at IS NULL');
    expect(fragment).toContain('AND roles.status = :roleActiveStatus');

    expect(params).toEqual({
      userUuid: 'user-uuid',
      userActiveStatus: RecordStatus.ACTIVE,
      roleActiveStatus: RecordStatus.ACTIVE,
    });
  });

  it('maps every row to a bare (action, subject) pair', async () => {
    const { qb } = buildQueryBuilderMock([
      buildOrmAbility(Action.READ, Subject.USER),
      buildOrmAbility(Action.UPDATE, Subject.ROLE),
    ]);

    const createQueryBuilder = jest.fn().mockReturnValue(qb);

    const repository = {
      createQueryBuilder,
    } as unknown as Repository<AbilityOrmEntity>;

    const adapter = new TypeOrmUserAbilityRepository(repository);

    const result = await adapter.findGrantedAbilities('user-uuid');

    expect(result).toEqual([
      { action: Action.READ, subject: Subject.USER },
      { action: Action.UPDATE, subject: Subject.ROLE },
    ]);
  });

  it('returns [] when the user has no granted abilities', async () => {
    const { qb } = buildQueryBuilderMock([]);
    const createQueryBuilder = jest.fn().mockReturnValue(qb);

    const repository = {
      createQueryBuilder,
    } as unknown as Repository<AbilityOrmEntity>;

    const adapter = new TypeOrmUserAbilityRepository(repository);

    await expect(adapter.findGrantedAbilities('user-uuid')).resolves.toEqual(
      [],
    );
  });
});
