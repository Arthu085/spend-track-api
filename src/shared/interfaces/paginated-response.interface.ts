import { PaginationMeta } from '../types/pagination-meta.type';

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}
