import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import { UserEntity } from '../entities/user.entity';
import { UserEmail } from '../value-objects/user-email.vo';
import { SaveUserRelations } from '../../application/types/save-user-relations.type';

export interface IUserRepository {
  findByUuid(uuid: Uuid): Promise<UserEntity | null>;

  findByEmail(email: UserEmail): Promise<UserEntity | null>;

  save(user: UserEntity, relations: SaveUserRelations): Promise<void>;
}
