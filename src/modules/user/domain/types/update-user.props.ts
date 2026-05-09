import { UserEmail } from '../value-objects/user-email.vo';
import { UserFullName } from '../value-objects/user-full-name.vo';
import { UserPassword } from '../value-objects/user-password.vo';
import { Uuid } from 'src/core/domain/value-objects/uuid.vo';

export interface UpdateUserProps {
  fullName?: UserFullName;
  email?: UserEmail;
  password?: UserPassword;
  roleUuid?: Uuid;
}
