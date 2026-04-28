import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import { UserEntity } from '../entities/user.entity';
import { UserEmail } from '../value-objects/user-email.vo';

export interface IUserRepository {
  findByUuid(uuid: Uuid): Promise<UserEntity | null>;

  findByEmail(email: UserEmail): Promise<UserEntity | null>;
}
