import { StatusEnum } from 'src/core/domain/enums/status.enum';
import { RoleEnum } from 'src/modules/access-control/domain/enums/role.enum';

export type UserFindAllCriteria = {
  page?: number;
  limit?: number;
  status?: StatusEnum;
  createdAtFrom?: string;
  createdAtTo?: string;
  fullName?: string;
  role?: RoleEnum;
};
