import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import { UserEntity } from '../entities/user.entity';
import { UserEmail } from '../value-objects/user-email.vo';
import { UserFindAllCriteria } from '../types/user-find-all-criteria.type';
import { UserSaveRelations } from '../types/user-save-relations.type';

export interface IUserRepository {
  findAll(criteria: UserFindAllCriteria): Promise<[UserEntity[], number]>;

  findByUuid(uuid: Uuid): Promise<UserEntity | null>;

  findByEmail(email: UserEmail): Promise<UserEntity | null>;

  save(user: UserEntity, relations?: UserSaveRelations): Promise<void>;
}
