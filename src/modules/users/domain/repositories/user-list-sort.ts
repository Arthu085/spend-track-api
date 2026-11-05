import type { ListSort } from '@shared/domain/sorting/list-sort';

export const USER_SORT_FIELDS = [
  'name',
  'email',
  'status',
  'createdAt',
] as const;

export type UserListSort = ListSort<(typeof USER_SORT_FIELDS)[number]>;
