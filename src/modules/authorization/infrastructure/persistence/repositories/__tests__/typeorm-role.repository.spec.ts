import { mockOf } from '@test/support/mocks/mock-of';
import type { Repository } from 'typeorm';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { RoleEntity } from '../../../../domain/entities/role.entity';
import { RoleEnum } from '../../../../domain/enums/role.enum';
import { RoleOrmEntity } from '../../entities/role.orm-entity';
import { TypeOrmRoleRepository } from '../typeorm-role.repository';

function buildOrmRole(): RoleOrmEntity {
  const orm = new RoleOrmEntity();
  orm.id = 1;
  orm.uuid = 'role-uuid';
  orm.status = RecordStatus.ACTIVE;
  orm.name = RoleEnum.ADMIN;
  orm.abilities = [];
  orm.createdAt = new Date();
  orm.updatedAt = new Date();
  orm.deletedAt = null;
  return orm;
}

function buildDomainRole(): RoleEntity {
  return RoleEntity.reconstitute({
    id: 1,
    uuid: 'role-uuid',
    status: RecordStatus.ACTIVE,
    name: RoleEnum.ADMIN,
    abilities: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });
}

describe('TypeOrmRoleRepository', () => {
  it('findAll maps every ORM row with the abilities relation', async () => {
    const find = jest.fn().mockResolvedValue([buildOrmRole()]);
    const repository = { find } as unknown as Repository<RoleOrmEntity>;
    const adapter = new TypeOrmRoleRepository(repository);

    const result = await adapter.findAll();

    expect(find).toHaveBeenCalledWith({ relations: { abilities: true } });
    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(RoleEntity);
  });

  it.each([
    ['role', 'name', 'ASC'],
    ['status', 'status', 'DESC'],
    ['createdAt', 'createdAt', 'ASC'],
  ] as const)(
    'findAll sorts %s and retains abilities',
    async (sortBy, column, sortOrder) => {
      const find = jest.fn().mockResolvedValue([]);

      const adapter = new TypeOrmRoleRepository(
        mockOf<Repository<RoleOrmEntity>>({ find }),
      );

      await adapter.findAll({ sortBy, sortOrder });

      expect(find).toHaveBeenCalledWith({
        relations: { abilities: true },
        order: { [column]: sortOrder, id: 'DESC' },
      });
    },
  );

  it('findAll defaults explicit sorting to ascending and ignores an orphan direction', async () => {
    const find = jest.fn().mockResolvedValue([]);

    const adapter = new TypeOrmRoleRepository(
      mockOf<Repository<RoleOrmEntity>>({ find }),
    );

    await adapter.findAll({ sortBy: 'role' });
    expect(find).toHaveBeenLastCalledWith({
      relations: { abilities: true },
      order: { name: 'ASC', id: 'DESC' },
    });

    await adapter.findAll({ sortOrder: 'DESC' });
    expect(find).toHaveBeenLastCalledWith({ relations: { abilities: true } });
  });

  it('findByUuid returns null when no row matches', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    const repository = { findOne } as unknown as Repository<RoleOrmEntity>;
    const adapter = new TypeOrmRoleRepository(repository);

    await expect(adapter.findByUuid('missing')).resolves.toBeNull();
    expect(findOne).toHaveBeenCalledWith({
      where: { uuid: 'missing' },
      relations: { abilities: true },
    });
  });

  it('findByUuid maps the row to a domain entity when found', async () => {
    const findOne = jest.fn().mockResolvedValue(buildOrmRole());
    const repository = { findOne } as unknown as Repository<RoleOrmEntity>;
    const adapter = new TypeOrmRoleRepository(repository);

    const result = await adapter.findByUuid('role-uuid');

    expect(result).toBeInstanceOf(RoleEntity);
    expect(result?.uuid).toBe('role-uuid');
  });

  it('findByUuids short-circuits to [] for an empty input without querying', async () => {
    const find = jest.fn();
    const repository = { find } as unknown as Repository<RoleOrmEntity>;
    const adapter = new TypeOrmRoleRepository(repository);

    await expect(adapter.findByUuids([])).resolves.toEqual([]);
    expect(find).not.toHaveBeenCalled();
  });

  it('findByUuids queries by the given uuids', async () => {
    const find = jest.fn().mockResolvedValue([buildOrmRole()]);
    const repository = { find } as unknown as Repository<RoleOrmEntity>;
    const adapter = new TypeOrmRoleRepository(repository);

    const result = await adapter.findByUuids(['role-uuid']);

    expect(result).toHaveLength(1);
    expect(find).toHaveBeenCalledTimes(1);
  });

  it('update saves the mapped role and reloads it with the abilities relation', async () => {
    const savedOrm = buildOrmRole();
    const save = jest.fn().mockResolvedValue(savedOrm);
    const findOneOrFail = jest.fn().mockResolvedValue(buildOrmRole());

    const repository = {
      save,
      findOneOrFail,
    } as unknown as Repository<RoleOrmEntity>;

    const adapter = new TypeOrmRoleRepository(repository);

    const result = await adapter.update(buildDomainRole());

    expect(save).toHaveBeenCalledTimes(1);
    expect(findOneOrFail).toHaveBeenCalledWith({
      where: { id: savedOrm.id },
      relations: { abilities: true },
    });
    expect(result).toBeInstanceOf(RoleEntity);
  });
});
