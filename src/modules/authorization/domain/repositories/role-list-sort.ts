import type { ListSort } from '@shared/domain/sorting/list-sort';

export const ROLE_SORT_FIELDS = ['role', 'status', 'createdAt'] as const;

export type RoleListSort = ListSort<(typeof ROLE_SORT_FIELDS)[number]>;
