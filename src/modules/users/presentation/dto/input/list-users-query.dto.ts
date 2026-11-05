import {
  PaginationQueryDto,
  SortByField,
  SortOrderField,
  StatusFilterField,
  TextFilterField,
  UuidFilterField,
} from '@shared/presentation/dto';
import {
  EMAIL_MAX_LENGTH,
  USER_NAME_MAX_LENGTH,
} from '@shared/domain/constraints';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import {
  USER_SORT_FIELDS,
  type UserListSort,
} from '../../../domain/repositories/user-list-sort';

export class ListUsersQueryDto extends PaginationQueryDto {
  @SortByField(USER_SORT_FIELDS)
  sortBy?: UserListSort['sortBy'];

  @SortOrderField()
  sortOrder?: UserListSort['sortOrder'];

  @TextFilterField({ maxLength: USER_NAME_MAX_LENGTH })
  name?: string;

  @TextFilterField({ maxLength: EMAIL_MAX_LENGTH })
  email?: string;

  @UuidFilterField('Filter by role uuid (exact match).')
  role?: string;

  @StatusFilterField()
  status?: RecordStatus;
}
