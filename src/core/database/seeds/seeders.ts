import {
  AbilitiesSeeder,
  RoleAbilitiesSeeder,
  RolesSeeder,
} from '@modules/authorization/persistence';
import { GlobalCategoriesSeeder } from '@modules/categories/persistence';
import { UsersSeeder } from '@modules/users/persistence';
import { Seeder } from './seeder.interface';

export const seeders: Seeder[] = [
  new AbilitiesSeeder(),
  new RolesSeeder(),
  new RoleAbilitiesSeeder(),
  new UsersSeeder(),
  new GlobalCategoriesSeeder(),
];
