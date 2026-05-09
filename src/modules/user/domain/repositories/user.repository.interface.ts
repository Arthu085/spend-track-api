import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import { UserEntity } from '../entities/user.entity';
import { UserEmail } from '../value-objects/user-email.vo';
import { SaveUserRelations } from '../../application/types/save-user-relations.type';
import { FindAllUserRequestDto } from '../../application/dtos/request/find-all-user.request.dto';

export interface IUserRepository {
  findAll(query: FindAllUserRequestDto): Promise<[UserEntity[], number]>;

  findByUuid(uuid: Uuid): Promise<UserEntity | null>;

  findByEmail(email: UserEmail): Promise<UserEntity | null>;

  save(user: UserEntity, relations?: SaveUserRelations): Promise<void>;
}
