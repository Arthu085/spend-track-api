import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { RoleEnum } from '@modules/authorization';
import { UserEntity } from '../entities/user.entity';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface PaginatedUsers {
  items: UserEntity[];
  total: number;
}

export interface UserListFilters {
  name?: string;
  email?: string;
  role?: string;
  status?: RecordStatus;
}

export interface AuthSubject {
  id: number;
  uuid: string;
  status: RecordStatus;
  name: string;
  email: string;
  emailConfirmedAt: Date | null;
  roleNames: RoleEnum[];
}

export interface UserRepository {
  findAllPaginated(
    offset: number,
    limit: number,
    filters?: UserListFilters,
  ): Promise<PaginatedUsers>;
  findByUuid(uuid: string): Promise<UserEntity | null>;
  findAuthSubject(uuid: string): Promise<AuthSubject | null>;
  findById(id: number): Promise<UserEntity | null>;
  findByUuidForUpdate(uuid: string): Promise<UserEntity | null>;
  findByIdForUpdate(id: number): Promise<UserEntity | null>;
  findByEmail(email: string): Promise<UserEntity | null>;
  lockAdminRoster(): Promise<void>;
  countActiveAdmins(): Promise<number>;
  create(user: UserEntity): Promise<UserEntity>;
  update(user: UserEntity): Promise<UserEntity>;
  softDelete(user: UserEntity): Promise<void>;
}
