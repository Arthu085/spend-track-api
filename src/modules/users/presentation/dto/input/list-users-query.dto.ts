import {
  PaginationQueryDto,
  StatusFilterField,
  TextFilterField,
  UuidFilterField,
} from '@shared/presentation/dto';
import {
  EMAIL_MAX_LENGTH,
  USER_NAME_MAX_LENGTH,
} from '@shared/domain/constraints';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';

export class ListUsersQueryDto extends PaginationQueryDto {
  @TextFilterField({ maxLength: USER_NAME_MAX_LENGTH })
  name?: string;

  @TextFilterField({ maxLength: EMAIL_MAX_LENGTH })
  email?: string;

  @UuidFilterField('Filter by role uuid (exact match).')
  role?: string;

  @StatusFilterField()
  status?: RecordStatus;
}
