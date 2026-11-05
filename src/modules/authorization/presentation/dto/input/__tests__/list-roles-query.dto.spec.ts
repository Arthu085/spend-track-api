import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListRolesQueryDto } from '../list-roles-query.dto';

describe('ListRolesQueryDto sorting', () => {
  it.each([
    {},
    { sortBy: 'role' },
    { sortBy: 'status', sortOrder: 'ASC' },
    { sortBy: 'createdAt', sortOrder: 'DESC' },
  ])('accepts optional sorting %j', async (query) => {
    expect(
      await validate(plainToInstance(ListRolesQueryDto, query)),
    ).toHaveLength(0);
  });

  it.each([
    { sortBy: 'password' },
    { sortBy: 'name; DROP TABLE users' },
    { sortBy: ['role', 'status'] },
    { sortBy: '' },
    { sortOrder: 'asc' },
    { sortOrder: 'INVALID' },
    { sortOrder: ['ASC', 'DESC'] },
  ])('rejects invalid sorting %j', async (query) => {
    const errors = await validate(plainToInstance(ListRolesQueryDto, query));

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toHaveProperty('isIn');
  });
});
