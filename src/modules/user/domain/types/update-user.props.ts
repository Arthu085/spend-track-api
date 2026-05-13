import { RoleEntity } from 'src/modules/access-control/domain/entities/role.entity';
import { UserEmail } from '../value-objects/user-email.vo';
import { UserFullName } from '../value-objects/user-full-name.vo';
import { UserPassword } from '../value-objects/user-password.vo';

export interface UpdateUserProps {
  fullName?: UserFullName;
  email?: UserEmail;
  password?: UserPassword;
  role?: RoleEntity;
}
