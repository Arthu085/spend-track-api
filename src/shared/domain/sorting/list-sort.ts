export const SORT_ORDERS = ['ASC', 'DESC'] as const;

export type SortOrder = (typeof SORT_ORDERS)[number];

export interface ListSort<Field extends string> {
  sortBy?: Field;
  sortOrder?: SortOrder;
}
