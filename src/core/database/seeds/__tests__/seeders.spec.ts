import { seeders } from '../seeders';

describe('seeders registry', () => {
  it('registers the authorization, users, and transaction categories seeders in FK order', () => {
    expect(seeders.map((seeder) => seeder.name)).toEqual([
      'abilities-seeder',
      'roles-seeder',
      'role-abilities-seeder',
      'users-seeder',
      'global-transaction-categories-seeder',
    ]);
  });
});
