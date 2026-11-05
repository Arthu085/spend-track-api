import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListUsersQueryDto } from '../list-users-query.dto';

describe('ListUsersQueryDto sorting', () => {
  it.each([
    {},
    { sortBy: 'name' },
    { sortBy: 'status', sortOrder: 'ASC' },
    { sortBy: 'createdAt', sortOrder: 'DESC' },
  ])('accepts optional sorting %j', async (query) => {
    expect(
      await validate(plainToInstance(ListUsersQueryDto, query)),
    ).toHaveLength(0);
  });

  it.each([
    { sortBy: 'password' },
    { sortBy: 'name; DROP TABLE users' },
    { sortBy: ['name', 'status'] },
    { sortBy: '' },
    { sortOrder: 'asc' },
    { sortOrder: 'INVALID' },
    { sortOrder: ['ASC', 'DESC'] },
  ])('rejects invalid sorting %j', async (query) => {
    const errors = await validate(plainToInstance(ListUsersQueryDto, query));

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toHaveProperty('isIn');
  });
});
