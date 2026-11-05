import { SortByField, SortOrderField } from '@shared/presentation/dto';
import {
  ROLE_SORT_FIELDS,
  type RoleListSort,
} from '../../../domain/repositories/role-list-sort';

export class ListRolesQueryDto {
  @SortByField(ROLE_SORT_FIELDS)
  sortBy?: RoleListSort['sortBy'];

  @SortOrderField()
  sortOrder?: RoleListSort['sortOrder'];
}
